---
name: financial-data-auditor
description: Verify multi-user data isolation boundaries and prevent unauthorized cross-account data access. Use this skill whenever you want to audit data isolation, check user data boundaries, verify account separation, or investigate potential data leaks. Checks if users can only access their own data, validates sessionStorage vs localStorage isolation, audits Supabase RLS policies, and flags any hardcoded accountIds that would cause data leakage.
compatibility: Node.js, Supabase access, ability to query database
---

## Overview

This skill performs a comprehensive audit of your Financial 101 Master multi-user data isolation. It catches leaks like the May 10, 2026 incident (all users seeing all data due to hardcoded accountIds and localStorage persistence).

## Critical Checks

### 1. User Data Isolation
For each user:
- ✅ List all accessible accounts
- ✅ Verify user can only see THEIR accountIds (not others')
- ✅ Confirm transactions/expenses filtered by userId
- ✅ Check backups scoped to user's accounts only
- 🚨 **FAIL if:** User A can access User B's data

### 2. Session Storage Isolation
- ✅ Verify sensitive data uses `sessionStorage` (cleared on tab close)
- ✅ Check `clearStore()` called on logout
- ✅ Confirm `localStorage` only stores non-sensitive (cosmetic) data
- 🚨 **FAIL if:** Old user's data persists after logout in same browser tab

### 3. Hardcoded AccountIds
- ✅ Scan codebase for hardcoded strings like `id="toy"`, `accountId="123"`
- ✅ Verify no default/fallback accountIds
- ✅ Check env vars (not code) control initial setup
- 🚨 **FAIL if:** Any hardcoded accountId means ALL users share that account

### 4. API Authorization
- ✅ POST /api/sync validates user owns `storageKey` param
- ✅ GET /api/sync returns 403 for unauthorized access
- ✅ All api/* endpoints authenticate + verify `userId`
- 🚨 **FAIL if:** API endpoints don't validate ownership

### 5. Supabase RLS Policies
- ✅ Verify tables have Row Level Security (RLS) enabled
- ✅ Check policies filter by `auth.uid()` or `user_id`
- ✅ Ensure no `FOR ALL` policies that bypass user context
- 🚨 **FAIL if:** Any table accessible without user filtering

### 6. Store Hydration
- ✅ On fresh login, correct user's data loads (not previous user's)
- ✅ Old browser cache doesn't leak to new user
- ✅ Session ID changes on login
- 🚨 **FAIL if:** User B sees User A's cached state

## How to use

**Run a full audit:**
```
"Audit data isolation for all users"
```

**Check specific user:**
```
"Does user toy@example.com have access to patipat's data?"
```

**Verify code for leaks:**
```
"Scan the codebase for hardcoded accountIds"
```

## Expected output

A detailed report with:
- ✅ PASS / ❌ FAIL for each check
- 🚨 Critical issues (data IS leaking)
- ⚠️ Warnings (data COULD leak if...)
- 📋 Audit trail (which users accessed what)
- 🔧 Remediation (how to fix each issue)

## Common Issues & Fixes

### Issue: User A sees all accounts, not just their own
**Root cause:** `getCurrentAccount()` returns hardcoded account instead of user's  
**Fix:** In `src/lib/accounts.ts`, ensure:
```typescript
export function getCurrentAccount(userId: string) {
  // WRONG: return { id: "toy", name: "Toy" };  // hardcoded!
  // RIGHT:
  const account = store.getState().accounts.find(a => a.userId === userId);
  return account;
}
```
**Prevention:** Never hardcode accountIds in source code

### Issue: Data persists after logout in same tab
**Root cause:** Using `localStorage` instead of `sessionStorage`  
**Fix:** In `src/lib/store.ts`, change:
```typescript
// WRONG
const savedState = localStorage.getItem("financial-planner-storage-v3");

// RIGHT - use sessionStorage for sensitive data
const savedState = sessionStorage.getItem("financial-planner-storage-v3");
// AND add to logout handler:
clearStore(); // clears both session and in-memory state
```
**Prevention:** Use sessionStorage for all user data

### Issue: API accepts /api/sync?storageKey=other-user-key
**Root cause:** No authorization check in route handler  
**Fix:** In `src/app/api/sync/route.ts`:
```typescript
const userId = await getAuthenticatedUser();  // throws 401 if not logged in
const userKey = `user-${userId}-storage`;
if (storageKey !== userKey) {
  return new Response("Unauthorized", { status: 403 });  // ← add this
}
```
**Prevention:** Always validate user owns the requested resource

### Issue: Supabase shows "RLS not enforced"
**Root cause:** RLS disabled on table  
**Fix:** In Supabase dashboard:
```sql
-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Add policy
CREATE POLICY "Users access own expenses"
  ON expenses
  FOR SELECT
  USING (auth.uid() = user_id);
```
**Prevention:** Enable RLS on all tables, write explicit policies

## May 10, 2026 Incident Summary

**What happened:** New users inherited previous user's data  
**Root cause #1:** All users had hardcoded `accountId="toy"`  
**Root cause #2:** `localStorage` persisted data across different user sessions  
**Root cause #3:** Session store never cleared on logout  

**What we fixed:**
1. Removed hardcoded accountIds; made them per-user
2. Switched to `sessionStorage` (auto-cleared on tab close)
3. Added `clearStore()` to logout handler
4. Added userId validation to all API endpoints

**How to prevent recurrence:** Run this audit quarterly + before every major release

## Script reference

```bash
# Audit all users for cross-account access
for user in "toy.theeranan@gmail.com" "patipat.arc@gmail.com"; do
  echo "Checking $user..."
  node -e "require('./src/lib/audit').auditUser('$user')"
done

# Scan for hardcoded accountIds
grep -r "accountId.*=" src/ --include="*.ts" --include="*.tsx" | grep -v "userId"

# Check localStorage usage (should be minimal/none for sensitive data)
grep -r "localStorage" src/ --include="*.ts" --include="*.tsx"

# Verify RLS enabled on all tables
psql $SUPABASE_URL -c "SELECT * FROM pg_catalog.pg_class WHERE relname IN ('expenses', 'accounts', 'transactions') AND rowsecurity = false;"
```

## See also

- [Deployment Validator](../deployment-validator/SKILL.md) — Pre-deploy safety checks
- [Account Sync Debugger](../account-sync-debugger/SKILL.md) — Fix multi-account switching
- [CLAUDE.md](../../CLAUDE.md) — Multi-user data isolation checklist
