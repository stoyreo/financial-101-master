# Fix Summary: New User Data Flood Bug (2026-05-11)

## Issue
When a brand-new user signs up in the same browser session as a logged-in user, they inherit the previous user's financial data instead of starting with clean seed data.

## Root Cause
Two compounding issues:
1. **PRIMARY:** `synthesizeSession()` never cleared the Zustand store before activating a new session
2. **SECONDARY:** `signup/page.tsx` redirected immediately without resetting sessionStorage

## Fixes Applied

### ✅ Fix 1: Clear store in `synthesizeSession()` (src/lib/auth.ts)
- Added store-clearing logic at the TOP of `synthesizeSession()`
- Uses the same async import pattern as `clearSession()` to avoid circular dependencies
- Resets all financial data to seed state + clears sessionStorage
- Pattern: fire-and-forget IIFE to avoid blocking session creation

### ✅ Fix 2: Explicit sessionStorage clear in signup form (src/app/signup/page.tsx)
- Added `sessionStorage.removeItem("financial-planner-storage-v3")` before redirect
- Belt-and-suspenders approach: ensures clean state even if Fix 1's async import hasn't resolved yet
- Non-blocking: wrapped in try-catch (non-fatal if storage access fails)

### ✅ Fix 3: Verified storageKey uniqueness (src/lib/users.ts)
- `findOrCreateUserByEmail()` line 537: `const storageKey = `fp_data_${supabaseUserId}`;`
- Uses unique Supabase `userId` (not username/email) — collision-proof ✓
- Each new user gets a unique storageKey

## Testing Checklist

Before deploying, verify in an Incognito/Private tab:

1. [ ] **Fresh signup scenario:**
   - Log in as toy.theeranan@icloud.com
   - Open a new Incognito window
   - Sign up as testuser@example.com
   - Verify: home page shows ZERO real data, only seed demo data

2. [ ] **Data isolation:**
   - Incognito tab 1: Sign up as user1@test.com → verify empty/seed-only data
   - Incognito tab 2: Sign up as user2@test.com → verify DIFFERENT from user1's data
   - Both should see identical seed defaults, no cross-contamination

3. [ ] **Existing user unaffected:**
   - Log out from incognito
   - Sign in as toy.theeranan@icloud.com
   - Verify: their real financial data loads correctly (scenarios, incomes, etc.)

4. [ ] **Repeat signup:**
   - Sign up as another new test account
   - Verify: still see only seed data, not toy's data

## Deployment

```bash
cd /Users/stoyreo/Desktop/Claude Migration
git add src/lib/auth.ts src/app/signup/page.tsx
git commit -m "fix: clear store on new user signup to prevent cross-user data flood"
git push origin main
# Vercel auto-deploys in ~1-2 minutes
```

## Files Modified
- `src/lib/auth.ts` — synthesizeSession() now clears store before activating new session
- `src/app/signup/page.tsx` — explicit sessionStorage cleanup before redirect
- `src/lib/users.ts` — verified (no changes needed, already correct)

## Notes
- All TypeScript edits made via file editor tools (NOT shell heredocs) per CLAUDE.md guidelines
- No `\!` escaping artifacts possible
- Pre-build check (`scripts/check-shell-escapes.mjs`) will validate on deploy
