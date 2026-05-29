---
name: account-sync-debugger
description: Diagnose and troubleshoot multi-account switching issues in Financial 101 Master. Use this when users report account switching problems, data not updating, or session persistence issues. Checks current user ID, lists available accounts, inspects Zustand store state, verifies Google Drive sync status, checks AI insights cache, and confirms email routing. Helps identify why account switching fails, data doesn't persist, or the wrong account data appears.
compatibility: Node.js, browser dev tools access, Supabase access
---

## Overview

This skill helps diagnose problems with Financial 101 Master's multi-account system (Toy, Patipat, patipat.arc@gmail.com). It's critical because the account switcher is core to the app, and issues here block entire workflows.

## Diagnostic Checks

### 1. Current User Session
- ✅ Verify authenticated user
- ✅ Confirm user ID is valid UUID
- ✅ Check session TTL (8 hours)
- ✅ Verify session not expired
- 🚨 **FAIL if:** No authenticated user (logout happened unexpectedly)

**Example output:**
```
Current User: toy.theeranan@gmail.com
User ID: a1b2c3d4-...
Session TTL: 7h 32m remaining
Status: ✅ Valid, active session
```

### 2. Available Accounts
- ✅ List all accounts accessible to user
- ✅ Verify account IDs are correct
- ✅ Check which account is currently selected
- ✅ Confirm account data loaded
- 🚨 **FAIL if:** User has 0 accounts (data loss scenario)

**Example output:**
```
Available Accounts:
  [1] 🎯 Toy (ID: toy-account-uuid) — ACTIVE
      Display name: "Toy Theeranan"
      Role: admin
      Created: Apr 10, 2026
      
  [2] Patipat (ID: pat-account-uuid)
      Display name: "Patipat Archanuwat"
      Role: editor
      Created: Apr 15, 2026
      
  [3] Work Account (ID: work-account-uuid)
      Display name: "patipat.arc@gmail.com"
      Role: admin
      Created: Apr 18, 2026
```

### 3. Zustand Store State
- ✅ Inspect current store state (accounts, expenses, income, etc.)
- ✅ Verify selected account matches current session
- ✅ Check store hasn't been corrupted
- ✅ Confirm recent actions (last 5 operations)
- 🚨 **FAIL if:** Store shows wrong accountId (stale/cached data)

**Example output:**
```
Store State:
  selectedAccountId: "toy-account-uuid" ✅ (matches session)
  accounts: [
    { id: "toy-account-uuid", name: "Toy", ... },
    { id: "pat-account-uuid", name: "Patipat", ... },
  ]
  expenses: 187 items
    └─ All filtered to "toy-account-uuid" ✅
  lastAction: "SET_ACCOUNT" (2m ago)
  storeVersion: 3
```

### 4. Google Drive Sync Status
- ✅ Last backup timestamp per account
- ✅ Sync frequency (30-min intervals configured?)
- ✅ Backup version count (30 versions retained?)
- ✅ Any sync errors in logs
- 🚨 **FAIL if:** Last backup > 1 hour ago (sync stuck)

**Example output:**
```
Google Drive Sync:
  Toy Account:
    Last backup: 2m ago ✅
    Status: Syncing...
    Versions retained: 28/30
    
  Patipat Account:
    Last backup: 45m ago ✅
    Status: Ready for next sync (scheduled 15m from now)
    Versions retained: 30/30 (oldest: May 20, newest: May 29)
    
  Work Account:
    Last backup: FAILED (May 28, 3pm)
    Error: "Unauthorized: Refresh token expired"
    Action: Re-authenticate in Backup Widget
```

### 5. AI Insights Cache
- ✅ Check cached insights per account
- ✅ Verify cache keys include accountId (not shared across accounts)
- ✅ Confirm cache invalidation works on account switch
- ✅ Check freshness (how old are cached insights?)
- 🚨 **FAIL if:** Same insights show for different accounts (cache leak)

**Example output:**
```
AI Insights Cache:
  Toy Account:
    Investment Optimization: Generated 3h ago (FRESH) ✅
    Tax Planning: Generated 1d ago (STALE) ⚠️
    Risk Assessment: Not generated
    Cache key: "ai-insights-toy-account-uuid" ✅ Scoped correctly
    
  Patipat Account:
    Investment Optimization: Generated 2h ago (FRESH) ✅
    Cache key: "ai-insights-pat-account-uuid" ✅ Scoped correctly
```

### 6. Email Routing
- ✅ Verify correct email(s) configured per account
- ✅ Check notification recipient addresses
- ✅ Confirm "Account Switched" emails route correctly
- ✅ Review email delivery logs (last 24h)
- 🚨 **FAIL if:** Emails go to wrong account's email address

**Example output:**
```
Email Routing:
  Toy Account:
    Primary: toy.theeranan@icloud.com ✅
    Notifications: Enabled
    Last email: "Account Switched" (2m ago to toy.theeranan@icloud.com) ✅
    
  Work Account:
    Primary: patipat.arc@gmail.com ✅
    Notifications: Enabled
    Last email: "Statement Imported" (1h ago to patipat.arc@gmail.com) ✅
```

## Common Issues & Fixes

### Issue: "Account Switcher shows no accounts"
**Symptoms:** Dropdown is empty, user can't switch accounts  
**Likely cause:** 
- User has 0 accounts (rare — DB issue)
- Account data failed to load from Supabase
- RLS policy blocks reading accounts table

**Diagnosis:**
```
1. Check "Available Accounts" section — is the list empty?
2. If empty, check Supabase dashboard: SELECT * FROM app_users WHERE user_id = '...'
3. If row exists, check RLS policy allows SELECT
```

**Fix:**
```sql
-- If RLS policy broken:
CREATE POLICY "Users read own accounts"
  ON app_users
  FOR SELECT
  USING (auth.uid() = user_id);
```

### Issue: "Clicked account switcher, nothing happens"
**Symptoms:** Button is clickable but doesn't switch accounts  
**Likely cause:**
- Zustand store update failed
- Selected account state not persisted
- Race condition (store hydrating while switching)

**Diagnosis:**
```
1. Check Zustand Store State section — does selectedAccountId match what you clicked?
2. Check browser console for errors
3. Verify last action is "SET_ACCOUNT" (not something else)
```

**Fix:**
```typescript
// In AppShell.tsx, ensure account switch includes:
const switchAccount = (accountId: string) => {
  // 1. Update store
  useFinancialStore.setState({ selectedAccountId: accountId });
  
  // 2. Persist to sessionStorage
  sessionStorage.setItem('selectedAccountId', accountId);
  
  // 3. Reset any cached data that shouldn't cross accounts
  clearAccountSpecificCache(accountId);
  
  // 4. Trigger refresh
  window.location.href = '/';  // or use router.refresh()
};
```

### Issue: "Data doesn't update when I switch accounts"
**Symptoms:** Click account switcher, but still see old account's data  
**Likely cause:**
- Store not cleared on logout/switch
- Expenses/income filtered by wrong accountId
- Components not subscribed to store changes

**Diagnosis:**
```
1. Check Zustand Store State — is selectedAccountId correct?
2. Check Expenses data — all filtered to that accountId?
3. Check console for warnings about stale subscriptions
```

**Fix:**
```typescript
// In store.ts, ensure expense filters use current selectedAccountId:
const expenses = store.getState().expenses.filter(
  e => e.accountId === store.getState().selectedAccountId  // ← MUST be dynamic
);
// NOT hardcoded:
// const expenses = store.getState().expenses.filter(e => e.accountId === "toy");
```

### Issue: "Google Drive backup stuck, not syncing"
**Symptoms:** "Last backup" is >1 hour old  
**Likely cause:**
- OAuth token expired
- Network error (offline?)
- Backup process crashed silently

**Diagnosis:**
```
1. Check Google Drive Sync Status section — any errors shown?
2. If "Refresh token expired", user needs to re-authenticate
3. If no error but stuck, check /api/sync logs for crashes
```

**Fix:**
```
1. Open Backup Widget (sidebar)
2. Click "Re-authenticate with Google Drive"
3. Complete OAuth flow
4. Manual backup button to force immediate sync
```

### Issue: "AI Insights show different recommendations per account"
**Symptoms:** Switch accounts, insights change appropriately  
**Expected behavior:** ✅ This is CORRECT (each account has own AI insights)  
**Problem only if:** Same insights show for different accounts (cache leak)

**Diagnosis:**
```
1. Check AI Insights Cache section
2. Verify cache keys include accountId: "ai-insights-TOY-uuid" vs "ai-insights-PAT-uuid"
3. If keys are generic "ai-insights", cache is leaking
```

**Fix:**
```typescript
// In lib/ai-insights.ts, ensure cache keys are account-scoped:
const getCachedInsights = (accountId: string) => {
  const cacheKey = `ai-insights-${accountId}`;  // ← must include accountId
  return sessionStorage.getItem(cacheKey);
};
```

## Script reference

```bash
# Get current user session
curl -X GET http://localhost:3000/api/auth/session

# List accounts for user
curl -X GET http://localhost:3000/api/accounts

# Check Zustand store via browser console
open "http://localhost:3000/"
# Then in DevTools:
document.querySelector('script') && window.__zustand_store__.getState()

# Check Google Drive sync status
curl -X GET http://localhost:3000/api/backup/status

# Check email routing
tail -f logs/email-routing.log

# Reset store (nuclear option)
localStorage.clear(); sessionStorage.clear(); window.location.reload();
```

## See also

- [Deployment Validator](../deployment-validator/SKILL.md) — Pre-deploy checks
- [Financial Data Auditor](../financial-data-auditor/SKILL.md) — Data isolation verification
- [AppShell Component](../../src/components/layout/AppShell.tsx) — Account switcher UI
- [Recent Work & Status](../../RECENT_WORK.md) — Multi-account feature history
