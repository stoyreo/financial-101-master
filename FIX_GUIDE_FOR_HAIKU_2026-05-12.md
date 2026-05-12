# Fix Guide for Haiku — Admin Sees "Somchai" Seed Data on Login

**Date:** 2026-05-12
**Reporter:** Toy
**Symptom:** When admin `toy.theeranan@icloud.com` logs in, the dashboard greets "Good day, Somchai 👋" and shows seed numbers (NetWorth -฿8,045,000, Mortgage ฿5,120,000, etc.). The sync widget shows "Synced to server ✓ — 100%".

This is the same family of bugs as the May 10 / May 11 incidents — but the previous fixes left **two gaps**. Follow this guide top to bottom.

---

## 1. Why the existing fixes are not enough

`src/lib/auth.ts → synthesizeSession()` only clears the Zustand store when **both** of these are true:

```ts
const existingSession = isClient ? getSession() : null;
if (isClient && existingSession && existingSession.userId !== appUser.id) {
  // clear store
}
```

That means on a **fresh tab login with no prior session** (the most common admin scenario), the store is NOT cleared. The store boots with `seedProfile` (name = "Somchai"), the auto-sync timer fires, and the **seed data gets pushed to `/api/sync` under admin's storageKey** — silently corrupting admin's row in `user_data`.

After that, every subsequent admin login pulls back "Somchai" because that is now what the server actually stores for admin.

There are therefore **two distinct problems** to fix:

1. **Local side**: store must always be reset on login *before* the auto-sync timer can fire, regardless of whether a prior session exists.
2. **Server side**: admin's `user_data` row is already corrupted with seed data — it has to be cleared (or hydrated from a known-good backup) once.

Both must be done. Fixing only one will not solve the symptom.

---

## 2. Code fix — `src/lib/auth.ts`

Replace the conditional store-reset in `synthesizeSession()` with an unconditional reset on every login. The current "skip reset if same user re-logging in" guard is too clever and is the source of the bug.

**Find this block (around lines 72–109):**

```ts
const existingSession = isClient ? getSession() : null;
if (isClient && existingSession && existingSession.userId !== appUser.id) {
  (async () => {
    try {
      const { useStore } = await import("./store");
      // … reset to seed …
      sessionStorage.removeItem("financial-planner-storage-v3");
    } catch { /* non-fatal */ }
  })();
}
```

**Replace with:**

```ts
// 🔐 ALWAYS reset Zustand to seed state on session synthesis.
// Rationale: skipping the reset when there is no prior session leaves the
// store holding the seed profile ("Somchai"), which the auto-sync timer
// then pushes to /api/sync under THIS user's storageKey — corrupting
// the server row. After reset, the server data is re-hydrated by the
// post-login GET /api/sync flow (see src/lib/users.ts → loadUserData).
if (isClient) {
  (async () => {
    try {
      const { useStore } = await import("./store");
      const seedMod = await import("./seed");
      const { buildDefaultMerchantRules } = await import("./categorize");
      useStore.setState({
        profile: seedMod.seedProfile,
        incomes: seedMod.seedIncomes,
        expenses: seedMod.seedExpenses,
        debts: seedMod.seedDebts,
        investments: seedMod.seedInvestments,
        retirement: seedMod.seedRetirement,
        tax: seedMod.seedTax,
        scenarios: seedMod.seedScenarios,
        activeScenarioId: "base",
        isSeedLoaded: true,
        transactions: [],
        merchantRules: buildDefaultMerchantRules(),
        statementImports: [],
        customExpenseCategories: [],
        yearlyForecast: [],
        monthlyForecast: [],
      }); // merge only — do NOT pass replace=true
      sessionStorage.removeItem("financial-planner-storage-v3");
    } catch { /* non-fatal */ }
  })();
}
```

**Edit tool only.** Per the project CLAUDE.md, never write `.ts` through bash heredocs/`sed`/`echo >` — that escapes `!` and `$` and breaks SWC.

---

## 3. Code fix — gate the auto-sync push on a successful remote read

Even with §2, there is still a race: store reset is fire-and-forget; the auto-sync interval could push the seed before the post-login GET completes.

Add a "hydrated from remote" flag.

**`src/lib/store.ts`** — add to the state slice (near `localSyncStatus`):

```ts
isHydratedFromRemote: boolean;
setHydratedFromRemote: (v: boolean) => void;
```

Initial value: `false`. Setter: `set((s) => { s.isHydratedFromRemote = v; })`.

**Wherever the auto-sync POST runs** (search for `fetch("/api/sync"` in `src/lib/users.ts → persistUserData` and any caller that posts on an interval/visibilitychange):

```ts
const { isHydratedFromRemote } = useStore.getState();
if (!isHydratedFromRemote) {
  // Don't push seed data over real server data. Wait until we've
  // confirmed what the server has for this user.
  return;
}
```

**Post-login hydration path** (the code that calls `loadUserData` after `synthesizeSession`):

```ts
const remote = await loadUserData(session.storageKey);
if (remote.ok) {
  // hydrate store from remote (existing code) …
  useStore.getState().setHydratedFromRemote(true);
} else if (remote.status === 404) {
  // No server data yet for this user — seed is acceptable to push.
  useStore.getState().setHydratedFromRemote(true);
}
// On any other error, leave the flag false so we never overwrite
// remote data we failed to read.
```

This is the structural fix. Without it, the bug can re-appear any time the reset-on-login path is changed.

---

## 4. Server fix — clean admin's corrupted `user_data` row

The fix above prevents *future* corruption. Admin's current row is already wrong. Pick one of the two options below.

### Option A — Reset admin to a clean (empty) state, let them re-import

In Supabase SQL editor:

```sql
-- Find admin's storageKey first
SELECT id, email, "storageKey" FROM app_users
WHERE email = 'toy.theeranan@icloud.com';

-- Then delete the corrupted row (admin will see seed on next login,
-- but the §2/§3 fix prevents that seed from being pushed back up).
DELETE FROM user_data WHERE storage_key = '<admin storageKey from query above>';
```

### Option B — Restore from a known-good Google Drive backup

Backup widget keeps 30 versions. Have Toy log in, open BackupWidget, select a version dated **before May 10**, and Restore. That overwrites the corrupted server row with real data.

Option B is preferable if any of admin's real numbers were ever saved. Option A is the safe fallback.

---

## 5. Don't forget the email-mismatch landmine

`src/lib/accounts.ts → MAIN_ACCOUNT.email` is `toy.theeranan@gmail.com`, but the admin in this incident is `toy.theeranan@icloud.com`. `getToyAccountId()` looks up by `gmail.com`. If any migration / fallback code path uses `getToyAccountId()` to assign transactions, admin's `@icloud.com` account will not match and will fall through to defaults.

**Action:** grep for `getToyAccountId` and `toy.theeranan@gmail.com` and confirm none of those callsites are reachable for the `@icloud.com` admin. If they are, either remove `MAIN_ACCOUNT` entirely (the function `getCurrentAccount()` now derives from session) or update the email to whichever account is the real admin.

---

## 6. Test plan (mandatory before pushing)

Run all of these in incognito windows so cookies / sessionStorage are clean.

1. **Fresh admin login, no prior data:**
   - Open incognito, log in as `toy.theeranan@icloud.com`.
   - Dashboard should greet by admin's username, **not** "Somchai".
   - Hard reload. Dashboard should still **not** show "Somchai".
2. **Cross-user same-tab:**
   - In same tab, sign out. Log in as a second user.
   - Second user must see their own data, **not** admin's.
3. **Server-side write check:**
   - In Supabase, `SELECT data->'profile'->>'name' FROM user_data WHERE storage_key = '<admin>';`
   - Must return admin's profile name, never "Somchai".
4. **Auto-sync gate:**
   - Open DevTools Network tab on a fresh login.
   - Confirm `GET /api/sync` fires **before** any `POST /api/sync`.
   - If a POST fires before the GET completes, §3 is not correctly wired.

---

## 7. Commit + deploy

```bash
cd /Users/stoyreo/Desktop/Claude Migration
git add src/lib/auth.ts src/lib/store.ts src/lib/users.ts
git commit -m "fix: always reset store on login + gate sync push on remote hydration"
git push origin main
```

Vercel auto-deploys to https://financial101.vercel.app in ~1–2 minutes. Then run §6 against production.

---

## 8. Files Haiku will touch

- `src/lib/auth.ts` — §2 (synthesizeSession unconditional reset)
- `src/lib/store.ts` — §3 (add `isHydratedFromRemote`)
- `src/lib/users.ts` — §3 (gate POST on flag, set flag after GET)
- Supabase `user_data` table — §4 (one-time cleanup)
- *(maybe)* `src/lib/accounts.ts` — §5 (email cleanup if applicable)

## 9. Files Haiku must NOT touch

- `src/app/api/sync/route.ts` — the server-side authorization is already correct. Do not modify.
- `scripts/check-shell-escapes.mjs` — pre-build guard, do not bypass.

---

**Summary of the root cause in one sentence:** the previous fix only cleared the store when switching between two existing sessions, but on a fresh-tab login the store still booted with the "Somchai" seed and the auto-sync timer pushed it to the server under admin's storageKey before any remote read could happen — corrupting admin's row permanently.
