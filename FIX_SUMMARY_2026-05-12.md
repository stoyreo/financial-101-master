# Admin Seed Data Bug Fix — Summary of Changes
**Date:** 2026-05-12  
**Issue:** Admin sees "Somchai" seed data on login (May 10 data isolation incident, round 3)

---

## ✅ Fixes Applied

### §2: `src/lib/auth.ts` — Unconditional Store Reset
**Status:** DONE

Changed `synthesizeSession()` to ALWAYS reset the Zustand store on every login, regardless of whether a prior session exists.

**What changed:**
- Removed the conditional: `if (isClient && existingSession && existingSession.userId !== appUser.id)`
- Now unconditionally resets to seed state: `if (isClient)` { reset }
- Added detailed comment explaining why: fresh-tab logins were skipping reset, leaving "Somchai" in memory for auto-sync to push

**Why this matters:**
- On a fresh browser tab (the most common admin scenario), there is no prior session
- The old code skipped the reset, so the store booted with `seedProfile` (name = "Somchai")
- The auto-sync timer would fire ~100ms later and push "Somchai" to the server under admin's storageKey
- This silently corrupted admin's row in `user_data`

---

### §3a: `src/lib/store.ts` — Add `isHydratedFromRemote` Flag
**Status:** DONE

Added a new state flag `isHydratedFromRemote: boolean` to gate auto-sync POST until remote data is confirmed.

**What changed:**
- Added `isHydratedFromRemote: boolean` to Store interface
- Added setter `setHydratedFromRemote: (v: boolean) => void`
- Initialize to `false` on every session start

**Why this matters:**
- Prevents race condition: store reset → auto-sync timer fires → POST "Somchai" before GET completes
- Creates a dependency: POST only allowed AFTER GET confirms what the server has

---

### §3b: `src/lib/users.ts` — Gate POST on Remote Hydration
**Status:** DONE

Modified `saveRemoteUserData()` to check `isHydratedFromRemote` before posting seed data.

**What changed:**
- Added guard at start of `saveRemoteUserData()`:
  ```ts
  if (isClient) {
    const { useStore } = await import("./store");
    const { isHydratedFromRemote } = useStore.getState();
    if (!isHydratedFromRemote) {
      console.log(`[saveRemoteUserData] Skipping POST — not yet hydrated...`);
      return { ok: false, error: "Not yet hydrated from remote" };
    }
  }
  ```

**Why this matters:**
- Auto-sync timer won't push data until we've confirmed the server state
- Gives the post-login GET /api/sync time to complete before allowing POST

---

### §3c: `src/lib/store.ts` — Set Flag After Remote Hydration
**Status:** DONE

Modified `loadUserNamespace()` action to set `isHydratedFromRemote = true` after successful GET.

**What changed:**
- After `loadRemoteUserData()` returns with `ok: true` and data → call `get().setHydratedFromRemote(true)`
- If remote returns 404 (no data yet for user) → also set flag to true (seed is acceptable to push)
- On any other error → leave flag false (don't risk overwriting unread remote data)

**Why this matters:**
- Signals to auto-sync that it's safe to POST: we've confirmed what the server has
- Two success paths: (1) got real data, (2) got 404 (no data yet — seed is OK)

---

## ⚠️ Manual Steps Still Required

### §4: Clean Admin's Corrupted Server Row
**Status:** MANUAL — Not automated

Admin's `user_data` row is already corrupted (contains Somchai seed data from the auto-sync before this fix). This must be cleaned up once:

**Option A: Delete & Re-import (simpler)**
```sql
-- Find admin's storageKey
SELECT id, email, "storageKey" FROM app_users
WHERE email = 'toy.theeranan@icloud.com';

-- Delete the corrupted row
DELETE FROM user_data WHERE storage_key = '<admin storageKey>';
```
Admin will see seed on next login, but §2/§3 fixes prevent it being pushed back.

**Option B: Restore from Backup (preferred if admin has real data)**
1. Admin logs in
2. Opens BackupWidget 
3. Selects a pre-May-10 snapshot
4. Clicks "Restore"
5. The pre-corruption data overwrites the server row

**Action:** Toy must choose Option A or B and execute once.

---

### §5: Email Mismatch Check
**Status:** VERIFIED (not an issue)

The fix guide warned about `MAIN_ACCOUNT.email = "toy.theeranan@gmail.com"` vs admin `"toy.theeranan@icloud.com"`.

**Finding:**
- `getToyAccountId()` is only imported in `migration.ts` but not actively used
- Current code uses `getCurrentAccount()` which derives account from session, not MAIN_ACCOUNT
- MAIN_ACCOUNT is a legacy fallback (SSR only); modern flow is session-based
- ✅ No email mismatch issue to fix

---

## 📋 Test Plan (§6)
**Status:** Ready to execute (requires incognito browser windows)

### Test 1: Fresh Admin Login
1. Open incognito window
2. Log in as `toy.theeranan@icloud.com`
3. ✅ Dashboard greets by admin's actual username, NOT "Somchai"
4. Hard reload (⌘+Shift+R)
5. ✅ Still shows admin's profile, not "Somchai"

### Test 2: Cross-User Same-Tab
1. Same tab, sign out
2. Log in as a different user
3. ✅ Second user sees their own data, not admin's data

### Test 3: Server-Side Write Verification
In Supabase SQL editor:
```sql
SELECT data->'profile'->>'name' FROM user_data 
WHERE storage_key = '<admin storageKey>';
```
✅ Must return admin's actual profile name, never "Somchai"

### Test 4: Auto-Sync Gate (DevTools)
1. Open incognito → open DevTools Network tab
2. Log in as admin
3. Watch Network for API calls
4. ✅ GET /api/sync fires FIRST
5. ✅ Any POST /api/sync only after GET completes
6. ❌ If POST fires before GET completes, §3 is not wired correctly

---

## 🚀 Deployment Checklist

- [x] §2: Store reset unconditional (auth.ts)
- [x] §3a: Add isHydratedFromRemote flag (store.ts)
- [x] §3b: Gate POST on flag (users.ts saveRemoteUserData)
- [x] §3c: Set flag after GET (store.ts loadUserNamespace)
- [x] §5: Verify no email mismatch issue
- [ ] §4: MANUAL — Clean admin's corrupted server row (Supabase SQL)
- [ ] §6: Run full test plan in incognito windows

### Commit Command
Once §4 is done and §6 tests pass:
```bash
cd /Users/stoyreo/Desktop/Claude\ Migration
git add src/lib/auth.ts src/lib/store.ts src/lib/users.ts
git commit -m "fix: always reset store on login + gate sync push on remote hydration

- synthesizeSession now unconditionally resets to seed state on every login
- Added isHydratedFromRemote flag to prevent auto-sync race condition
- POST /api/sync gated until we confirm remote data via GET
- Fixes May 12 admin seed data bug (round 3 of data isolation incidents)"
git push origin main
```

### Post-Deployment
1. Vercel auto-deploys to https://financial101.vercel.app (~1-2 minutes)
2. Run §6 tests against production
3. Toy must execute §4 (manual server cleanup) and verify §6 Test 3

---

## Root Cause Summary
**In one sentence:** The previous fix only cleared the store when switching between two existing sessions, but on a fresh-tab login the store still booted with the "Somchai" seed and the auto-sync timer pushed it to the server under admin's storageKey before any remote read could happen — corrupting admin's row permanently.

The structural fix (§3 flag) prevents this from ever re-appearing, even if reset-on-login logic is changed in the future.
