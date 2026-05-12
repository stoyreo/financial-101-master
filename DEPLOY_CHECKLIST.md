# Deployment Checklist — Admin Seed Data Bug Fix

**Last Updated:** 2026-05-12  
**Status:** CODE FIXES COMPLETE — Awaiting Supabase cleanup and testing

---

## ✅ Code Changes Completed

### src/lib/auth.ts (§2)
- [x] Changed `synthesizeSession()` to unconditionally reset store on every login
- [x] Removed conditional: `if (existingSession && existingSession.userId !== appUser.id)`  
- [x] Now: `if (isClient)` → always reset to seed state
- [x] Added detailed rationale comment

**Lines changed:** 72-107

---

### src/lib/store.ts (§3a & §3c)
- [x] Added `isHydratedFromRemote: boolean` to Store interface (line 114)
- [x] Added setter `setHydratedFromRemote: (v: boolean) => void` (line 117)
- [x] Initialize to `false` in initial state (line 176)
- [x] Add setter implementation (lines 798-800)
- [x] Set flag to `true` after successful `loadRemoteUserData()` (line 483)
- [x] Set flag to `true` if remote returns 404 (line 487)
- [x] Keep flag `false` on other errors (line 491)

**Lines changed:** 114, 117, 176, 483, 487, 491, 798-800

---

### src/lib/users.ts (§3b)
- [x] Gate `saveRemoteUserData()` with `isHydratedFromRemote` check (lines 236-250)
- [x] Skip POST if flag is `false` with explanatory log
- [x] Return error response to prevent corruption

**Lines changed:** 236-250

---

### src/lib/accounts.ts (§5)
- [x] Verified: `getToyAccountId()` not actively used (only imported in migration.ts as comment)
- [x] Current code uses session-based `getCurrentAccount()`, not MAIN_ACCOUNT
- [x] No email mismatch issue requires fixing
- [x] **Action:** None needed

---

## ⚠️ MANUAL ACTION REQUIRED

### §4: Clean Admin's Corrupted Server Data
**Status:** NOT YET DONE (requires Supabase access)

Admin's `user_data` row in Supabase is corrupted with Somchai seed data. This MUST be cleaned up once so admin doesn't keep seeing old seed data on next login.

**Choose ONE option:**

**Option A: Delete & Re-import (Simpler)**
1. In Supabase SQL editor, run:
```sql
-- Find admin's storageKey
SELECT id, email, "storageKey" FROM app_users
WHERE email = 'toy.theeranan@icloud.com';

-- Delete corrupted row (note: use the storageKey from query above)
DELETE FROM user_data 
WHERE storage_key = '<REPLACE_WITH_STORAGE_KEY_FROM_ABOVE>';
```

2. Admin logs in next time → will see seed data (Somchai)
3. Fixes in §2/§3 prevent seed from being pushed back to server
4. Admin can import their real data fresh from backup/CSV

**Option B: Restore from Backup (Preferred)**
1. Toy logs into app
2. Opens BackupWidget (in app dashboard)
3. Selects a backup snapshot dated BEFORE May 10, 2026
4. Clicks "Restore"
5. Pre-corruption data is restored to server

**Recommendation:** Option B if Toy has a good backup; Option A if no good backup exists.

---

## 📋 Test Plan (§6)
**Status:** Ready to execute (requires incognito browser windows)

### Pre-Testing: Verify Code Build
```bash
cd /Users/stoyreo/Desktop/Claude\ Migration
npm run build
```
✅ Must complete without TypeScript errors

### Test 1: Fresh Admin Login (No Prior Data)
1. Open incognito window (⌘+Shift+N on Mac, Ctrl+Shift+N on Windows)
2. Go to https://financial101.vercel.app
3. Log in with `toy.theeranan@icloud.com` / `<password>`
4. **EXPECTED:** Dashboard greets "Good day, [Admin's real name]" — NOT "Good day, Somchai"
5. Hard refresh (⌘+Shift+R on Mac, Ctrl+Shift+R on Windows)
6. **EXPECTED:** Still shows admin's name, not "Somchai" (fresh sessionStorage doesn't contain old data)

### Test 2: Cross-User Same-Tab Isolation
1. In same incognito tab, click Sign Out
2. Log in as a different user (member account)
3. **EXPECTED:** Second user sees ONLY their own data, not admin's financials
4. Hard refresh
5. **EXPECTED:** Still shows second user's data

### Test 3: Server-Side Data Verification
1. Access Supabase SQL editor
2. Run:
```sql
SELECT data->'profile'->>'name' FROM user_data 
WHERE storage_key = '<admin_storageKey>';
```
3. **EXPECTED:** Returns admin's actual profile name (after §4 cleanup)
4. **NOT EXPECTED:** Returns "Somchai" or NULL

### Test 4: Auto-Sync Gate (Network Inspection)
1. Open fresh incognito window
2. Open DevTools (F12) → Network tab
3. Log in as admin
4. Watch the Network tab during initial load (first 2-3 seconds)
5. **EXPECTED SEQUENCE:**
   - GET /api/sync fires FIRST (fetches what server has)
   - Sync status shows "Synced to server ✓ — 100%"
   - Any POST /api/sync only fires AFTER GET completes
6. **FAIL CONDITION:** POST fires before GET completes (means gate not working)

---

## 🚀 Final Deployment Steps

### Step 1: Pre-Deployment Verification
```bash
cd /Users/stoyreo/Desktop/Claude\ Migration

# Verify code compiles
npm run build

# Check git status
git status

# Should show only 3 modified files:
# - src/lib/auth.ts
# - src/lib/store.ts  
# - src/lib/users.ts
```

### Step 2: Commit Changes
```bash
git add src/lib/auth.ts src/lib/store.ts src/lib/users.ts
git commit -m "fix: always reset store on login + gate sync push on remote hydration

Fixes May 12 admin seed data bug (round 3 of data isolation incidents).

- synthesizeSession now unconditionally resets to seed state on every login
  (fixes fresh-tab logins where reset was skipped, leaving Somchai in memory)
  
- Added isHydratedFromRemote flag to prevent auto-sync race condition
  where store reset → auto-sync timer fires → POST seed before GET completes
  
- POST /api/sync now gated: only allowed after successful GET /api/sync
  confirms what the server has for this user
  
Related: May 10 (data isolation), May 11 (data flood), May 12 (seed corruption)"

git push origin main
```

### Step 3: Verify Deployment
- Vercel auto-deploys to https://financial101.vercel.app (~1-2 minutes)
- Watch Vercel dashboard at https://vercel.com for build status
- Check build logs if anything fails

### Step 4: Run Full Test Suite (§6)
Execute all 4 tests above in fresh incognito windows against production URL.

### Step 5: Execute §4 Cleanup (CRITICAL!)
**MUST do this before admin logs in again:**

In Supabase SQL Editor:
1. Option A: Delete corrupted row (admin re-imports data)
2. OR Option B: Restore from backup (if good backup exists)

Without §4, admin will still see "Somchai" on next login.

### Step 6: Verify Post-Cleanup (§6 Test 3)
Run database verification query again:
```sql
SELECT data->'profile'->>'name' FROM user_data 
WHERE storage_key = '<admin_storageKey>';
```
Should now return admin's real name (not "Somchai").

---

## Files Modified
- ✅ `src/lib/auth.ts` — §2 fix
- ✅ `src/lib/store.ts` — §3a & §3c fixes
- ✅ `src/lib/users.ts` — §3b fix

## Files NOT Modified (Correctly!)
- ✅ `src/app/api/sync/route.ts` — Server auth already correct
- ✅ `scripts/check-shell-escapes.mjs` — No bypass

---

## Rollback Plan
If issues arise post-deployment, revert last commit:
```bash
git revert HEAD
git push origin main
```
Vercel redeploys automatically. Admin will temporarily see seed data again, but subsequent fixes will prevent corruption.

---

## Sign-Off
- [x] Code changes implemented per §2-§5
- [x] No shell-escape artifacts (used Edit tool only)
- [x] Summary documentation created
- [ ] §4 manual Supabase cleanup executed
- [ ] §6 full test suite passed
- [ ] Committed and deployed to production
- [ ] Post-deployment verification complete

**Next Owner:** Toy (Theeranan) for §4 cleanup + final testing
