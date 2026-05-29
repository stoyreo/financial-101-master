# MCP Validation Tests
**Purpose:** Verify all 3 MCPs are connected and working correctly  
**Time:** ~10 minutes to run all tests

---

## Test Suite 1: Supabase MCP

### Test 1.1: Query Users Table
**Objective:** Verify Supabase connection and data access

**Prompt to paste in Claude:**
```
Using Supabase, show me all users in the app_users table. 
List the user email and how many accounts each user has.
```

**Expected output:**
- ✅ Multiple users listed
- ✅ Shows email addresses (toy.theeranan@gmail.com, patipat.arc@gmail.com, etc.)
- ✅ Shows account count for each (e.g., "Toy: 1 account, Patipat: 2 accounts")
- ✅ Response in <3 seconds

**If fails:**
- ❌ "Error: Unauthorized" → Check API key (use ANON key, not service role)
- ❌ "Connection timeout" → Check internet, restart Cowork
- ❌ "Table not found" → Verify table name is `app_users`

---

### Test 1.2: Verify Auth Sync
**Objective:** Ensure auth.users and app_users are in sync

**Prompt:**
```
Using Supabase, compare the number of rows in auth.users vs app_users.
Are they equal? If not, what's the difference?
```

**Expected output:**
- ✅ Count of auth.users and app_users shown
- ✅ If counts match: "✅ Auth sync is healthy"
- ✅ If counts differ by 1: "⚠️ 1 pending signup" (normal)
- ✅ If counts differ by >1: "❌ Auth sync issue — check logs"

**If fails:**
- ❌ No counts returned → RLS policy might be blocking reads
- ❌ Permission denied → Use correct API key

---

## Test Suite 2: Slack MCP

### Test 2.1: Send Basic Message
**Objective:** Verify Slack connection and message posting

**Prompt:**
```
Send a message to the #engineering channel (or your channel name):
"✅ Slack MCP test successful — timestamp: [current time]"
```

**Expected output:**
- ✅ Message appears in Slack channel immediately
- ✅ Shows exact text with emoji
- ✅ Timestamp is current (not old)
- ✅ Posted by your bot/integration account

**If fails:**
- ❌ "Channel not found" → Verify channel name (include # prefix in verification)
- ❌ "Unauthorized" → Check Slack workspace and permissions
- ❌ Message doesn't appear → Check channel visibility (private vs public)

---

### Test 2.2: Send Formatted Message
**Objective:** Test more complex Slack formatting

**Prompt:**
```
Send a formatted message to #engineering:
Title: "MCP Validation Results"
Status: ✅ Slack connector working
Timestamp: Now
Channel: #engineering
```

**Expected output:**
- ✅ Formatted message appears with structure
- ✅ Emojis render correctly
- ✅ All text visible and readable

**If fails:**
- ❌ Formatting broken → Try simpler text format
- ❌ Still "Channel not found" → Create channel, then retry

---

## Test Suite 3: Linear MCP

### Test 3.1: Create Test Issue
**Objective:** Verify Linear connection and issue creation

**Prompt:**
```
Create a new issue in Linear with these details:
- Project: "Financial 101 Master" (create if doesn't exist)
- Title: "✅ MCP Test: Linear connector verified"
- Description: "This issue was created by Slack MCP test. If you see it, the connector works."
- Labels: Add "optimization" label
```

**Expected output:**
- ✅ Issue appears in Linear within 2 seconds
- ✅ Has correct title and description
- ✅ Is in correct project
- ✅ Has "optimization" label applied

**If fails:**
- ❌ "Project not found" → Create project "Financial 101 Master" first, then retry
- ❌ "Authorization failed" → Check Linear workspace and permissions
- ❌ Issue doesn't appear → Wait 5 seconds, refresh Linear, check filters

---

### Test 3.2: Create Issue with Status
**Objective:** Test issue metadata and status

**Prompt:**
```
Create a new issue in Linear:
- Project: "Financial 101 Master"
- Title: "Feature: Email notifications via Slack"
- Description: "When user uploads statement, send Slack notification instead of email"
- Labels: "feature", "optimization"
- Status: Backlog (or TODO)
```

**Expected output:**
- ✅ Issue appears in Linear
- ✅ Status is set to Backlog
- ✅ Multiple labels applied
- ✅ Issue is assigned to you or team

**If fails:**
- ❌ Status not recognized → Use "Backlog" or project's default status
- ❌ Multiple labels not applying → Try one label at a time

---

## Test Suite 4: All Skills Together

### Test 4.1: Deployment Validator
**Objective:** Verify skill can run independently of MCPs

**Prompt:**
```
Run the Deployment Validator skill. Check if we're ready to deploy.
```

**Expected output:**
- ✅ Skill triggers (shows "Deployment Validator" or similar)
- ✅ Returns 10-point checklist
- ✅ Most/all show ✅ PASS
- ✅ Any ❌ FAIL items are identified with fixes

**If fails:**
- ❌ Skill doesn't trigger → Try different prompt: "validate deployment"
- ❌ "Skill not found" → Ensure SKILL.md files are in `src/skills/` folder

---

### Test 4.2: Financial Data Auditor
**Objective:** Test data isolation audit skill

**Prompt:**
```
Run Financial Data Auditor. Audit data isolation for user toy.theeranan@gmail.com.
Can they access other users' data?
```

**Expected output:**
- ✅ Skill triggers
- ✅ Lists user's accessible accounts (1-3 accounts)
- ✅ Shows ✅ PASS for isolation checks
- ✅ No ❌ FAIL or cross-account leakage reported

**If fails:**
- ❌ Shows cross-account access → Data isolation issue (contact support)
- ❌ Skill doesn't trigger → Try: "audit data isolation"

---

### Test 4.3: Statement Insights (requires uploaded statement)
**Objective:** Test statement analysis skill

**Pre-requisite:** Upload a bank statement in /expenses/actuals page first

**Prompt:**
```
Analyze the statement I just uploaded. What are the top spending categories?
Where can I save money?
```

**Expected output:**
- ✅ Skill triggers
- ✅ Shows spending by category with amounts/percentages
- ✅ Identifies 2-3 savings opportunities
- ✅ Suggests specific cuts with dollar amounts

**If fails:**
- ❌ "No statement data" → Upload statement first
- ❌ Skill doesn't trigger → Try: "analyze my spending"

---

### Test 4.4: Account Sync Debugger
**Objective:** Test account switching diagnostics

**Prompt:**
```
Debug account sync. Check the current user session, available accounts, 
and Zustand store state. Is everything correct?
```

**Expected output:**
- ✅ Skill triggers
- ✅ Shows current user (you)
- ✅ Lists 2-3 available accounts
- ✅ Confirms Zustand store is in correct state
- ✅ All checks show ✅ OK

**If fails:**
- ❌ Shows wrong user → Session issue (logout & login)
- ❌ Shows 0 accounts → Database issue (contact support)
- ❌ Skill doesn't trigger → Try: "debug account sync"

---

## Quick Reference: All Tests at a Glance

| Test | Command | Expected | Time |
|------|---------|----------|------|
| **Supabase** | Query users table | Shows all users | 30s |
| **Slack** | Send message | Appears in channel | 30s |
| **Linear** | Create issue | Appears in project | 2s |
| **Deployment Validator** | Run skill | 10-point checklist | 1m |
| **Data Auditor** | Run skill | Data isolation report | 1m |
| **Statement Insights** | Run skill (if statement uploaded) | Spending analysis | 2m |
| **Account Debugger** | Run skill | Session diagnostics | 1m |

**Total time:** ~10 minutes

---

## Scoring: How to Know You're Done

### ✅ All Tests Pass (100%)
- All Supabase queries return data
- Slack messages appear instantly
- Linear issues created successfully
- All 4 skills trigger and run correctly
- No errors or failures

**Result: READY TO DEPLOY** ✅

### ⚠️ Some Tests Fail (50-99%)
- Identify which connectors/skills failed
- Check troubleshooting section above
- Fix and re-test that specific test
- Once fixed, re-run only that test

**Result: FIX ISSUES, THEN DEPLOY**

### ❌ Major Failures (<50%)
- Multiple connectors not working
- Skills don't trigger
- Data isolation issues detected

**Result: DO NOT DEPLOY — Contact support**

---

## After All Tests Pass

1. ✅ Verify all tests passed
2. ✅ Document results in Linear ticket
3. ✅ Commit changes to git
4. ✅ Deploy to production:
   ```bash
   cd ~/Desktop/Claude\ Migration
   git add -A
   git commit -m "test: Validate all MCPs and skills working"
   git push origin main
   ```
5. ✅ Post to Slack: "🚀 All MCP connectors and optimization skills deployed successfully!"

---

## Test Results Log

Copy this into Linear or save locally:

```
## MCP Validation Results — May 29, 2026

### Supabase Tests
- [ ] Query users table — PASS/FAIL
- [ ] Auth sync check — PASS/FAIL

### Slack Tests  
- [ ] Send basic message — PASS/FAIL
- [ ] Send formatted message — PASS/FAIL

### Linear Tests
- [ ] Create test issue — PASS/FAIL
- [ ] Create issue with status — PASS/FAIL

### Skills Tests
- [ ] Deployment Validator — PASS/FAIL
- [ ] Financial Data Auditor — PASS/FAIL
- [ ] Statement Insights — PASS/FAIL
- [ ] Account Sync Debugger — PASS/FAIL

### Overall Result
☐ All pass — READY TO DEPLOY
☐ Some fail — Fix and retest
☐ Major failures — Do not deploy

### Notes
[Space for notes]
```

---

**Ready to start testing?** Begin with Test 1.1 (Supabase) and work through sequentially. Each test takes ~30 seconds to 2 minutes.
