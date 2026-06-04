# Handoff: Fix Sync Bar "Remote: error" + "Not yet hydrated from remote"
**Date:** 2026-05-30  
**App:** https://financial101.vercel.app  
**Repo:** https://github.com/stoyreo/financial-101-master  
**Stack:** Next.js 14, Supabase auth, Zustand persist (sessionStorage), Vercel

---

## Symptom
Sync bar always shows:
- **"Not yet hydrated from remote"**
- **Local: idle / Remote: error**

The app works (data loads, transactions visible) but nothing ever saves to the remote database.

---

## Root Cause (2 issues, both must be fixed together)

### Issue 1 — `loadUserNamespace()` is never called
`loadUserNamespace()` is defined in the Zustand store but **not invoked anywhere** in the new Supabase auth flow. It is the only function that:
- Loads data from `/api/sync` (the `user_data` Supabase table)
- Sets `isHydratedFromRemote = true`
- Triggers `saveUserNamespaceAsync` after loading

Without it being called:
- `isHydratedFromRemote` stays `false` permanently → "Not yet hydrated from remote"
- `saveRemoteUserData` has a guard that **skips saving** when `isHydratedFromRemote = false` (to prevent overwriting remote with empty data)
- AutoSync fires on data changes but the save is blocked by that guard

**Fix:** Call `useStore.getState().loadUserNamespace()` in `AuthGuard.tsx` after `bridgeLegacySession()` synthesizes the session.

### Issue 2 — `/api/sync` auth fails for email mismatch
The admin account in `app_users` table has email `toy.theeranan@icloud.com`.  
The Supabase auth account has email `toy.theeranan@gmail.com`.

`/api/sync`'s `getAuthenticatedUserStorageKey()` looks up `app_users` by `supabaseUser.email` only. When gmail email doesn't match the icloud row → "user not found" → **401 → Remote: error**.

The `supabase_user_id` column on the icloud row was back-filled by the `ensure-app-user` fix, but `/api/sync` doesn't use it.

**Fix:** Add a `supabase_user_id` fallback after email lookup fails in `getAuthenticatedUserStorageKey`.

---

## Files to Change

### 1. `src/components/AuthGuard.tsx`
Add `loadUserNamespace()` call after `bridgeLegacySession` succeeds:

```diff
+import { useStore } from "@/lib/store";

// inside AuthGuard useEffect, after bridgeLegacySession:
  await bridgeLegacySession(session.user.id, session.user.email ?? "");
+ useStore.getState().loadUserNamespace().catch(() => {/* non-fatal */});
  setChecking(false);
```

### 2. `src/app/api/sync/route.ts`
In `getAuthenticatedUserStorageKey`, after the email lookup returns no row:

```diff
  if (!userRows) {
+   // Fallback: look up by supabase_user_id (gmail vs icloud mismatch)
+   const { data: byUid } = await adminDb
+     .from("app_users").select("*")
+     .eq("supabase_user_id", supabaseUser.id).maybeSingle();
+   if (byUid) {
+     const appUser = rowToAppUser(byUid as any);
+     if (!appUser.isActive) return { ok: false, error: "unauthorized: inactive" };
+     return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
+   }
    console.warn("[getAuthenticatedUserStorageKey] User not found:", supabaseUser.email);
    return { ok: false, error: "unauthorized: user not found in app registry" };
  }
```

---

## What NOT to change
- Do NOT change `saveRemoteUserData` — the `isHydratedFromRemote` guard is intentional
- Do NOT change the `onRehydrateStorage` callback in `store.ts` — it handles Supabase direct sync (different table: `user_financial_data`)
- `/api/auth/ensure-app-user` is already fixed (uses admin client + email fallback)
- `auth-client.ts` `getSession()` is already fixed (reads from `fp_session_data` sessionStorage)

---

## Deploy Steps
1. Clone repo: `git clone https://github.com/stoyreo/financial-101-master.git`
2. Apply the two patches above
3. Commit and push to main → Vercel auto-deploys
4. After deploy, hard refresh (`Cmd+Shift+R`) the live app
5. Verify: sync bar shows "Saved" and "Remote: completed" briefly, then "idle"

---

## Additional Context: Dual Sync Systems
The app has **two parallel sync paths** that write to different Supabase tables. This is not broken but creates confusion:

| Path | Where it's called | Table | Key |
|------|-------------------|-------|-----|
| `onRehydrateStorage` → `supabase-sync.ts` | Zustand persist init | `user_financial_data` | `user_id` (Supabase UUID) |
| `loadUserNamespace` / `saveUserNamespaceAsync` → `/api/sync` | AuthGuard + AutoSync | `user_data` | `storage_key` (e.g. `fp_data_toy`) |

Data currently loads from `user_financial_data` (LINE transactions visible). The full financial profile (income, expenses, debts, investments) is in `user_data` under `fp_data_toy`. Once `loadUserNamespace` is called and `/api/sync` auth is fixed, both systems will work.

Long-term: consolidate to a single sync path (task #11 in the defect list).

---

## Key Environment Facts
- Supabase auth email: `toy.theeranan@gmail.com`  
- `app_users` admin row email: `toy.theeranan@icloud.com`  
- Admin storageKey: `fp_data_toy`  
- The `supabase_user_id` column on the icloud row was back-filled by a recent deploy

## Previous Fixes Already Live (do not re-apply)
- `ensure-app-user` rewrote to use admin client + 3-path resolution
- `getSession()` rewritten to read from `fp_session_data` sessionStorage
- `AuthGuard` calls `bridgeLegacySession()` after Supabase session check
- Store uses `sessionStorage` with one-time localStorage migration
- `clearStore()` + `clearSession()` called on logout
