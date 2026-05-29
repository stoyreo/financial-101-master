# MCP Setup Guide — Connect All 3 Connectors
**Duration:** 20 minutes total  
**Outcome:** Supabase, Slack, Linear all authenticated and ready

---

## 🔌 SUPABASE MCP (5 minutes)

### Where to find it in Cowork
1. Open your Cowork instance
2. Look for the **Connectors** panel (usually sidebar or top menu)
3. Search for: `supabase`
4. Click "Add" or "Connect"

### Authentication Flow
1. **Click "Authorize"** → Browser opens Supabase login
2. **Sign in** with your Supabase account (if not signed in)
3. **Select project:** Should show "financial-101-master" or similar
4. **Click "Authorize"** to grant Cowork access
5. Browser closes, Cowork shows ✅ **Connected**

### Your credentials to use
- **Supabase URL:** Found in Project Settings → API
  - Pattern: `https://[PROJECT-ID].supabase.co`
  - Example: `https://abc123xyz.supabase.co`
- **Supabase Key:** Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe, public)
  - NOT the service role key (that's admin-only)

### Test immediately (paste in Claude)
```
Using Supabase, run this query:
SELECT user_id, COUNT(*) as account_count 
FROM app_users 
GROUP BY user_id
```

**Expected result:** Shows all users with their account counts
- toy.theeranan@gmail.com: 1-3 accounts
- patipat.arc@gmail.com: 1-3 accounts
- etc.

**If fails:** 
- Check Supabase login credentials
- Verify project name matches your project
- Check network (must be online)

---

## 💬 SLACK MCP (10 minutes)

### Where to find it in Cowork
1. In Connectors panel, search for: `slack`
2. Click "Add" → Opens Slack OAuth screen

### Authentication Flow
1. **Sign in to Slack** (if not already signed in)
2. **Select workspace:** Choose your workspace (where you want notifications)
3. **Grant permissions:**
   - ✅ View channels and members
   - ✅ Send messages
   - ✅ Read message content
   - ✅ Create canvases (optional, nice to have)
4. **Click "Allow"** → Browser closes
5. Cowork shows ✅ **Connected**

### Your Slack workspace setup
**Create a new channel for deployment notifications:**
1. In Slack, click **+ Create** → Channel
2. Name it: `#engineering` (or `#deployments`)
3. Make it **private** if sensitive
4. Keep the channel open for testing

### Test immediately (paste in Claude)
```
Send a message to the #engineering Slack channel:
"🚀 MCP Setup: Slack connector is working! If you see this, connection successful."
```

**Expected result:** Message appears in Slack channel instantly
- Check timestamp (should be "now")
- Should include the emoji and full text

**If fails:**
- Check Slack workspace selection
- Verify channel name (`#engineering` or whatever you named it)
- Make sure your user has permissions to post

---

## 🎯 LINEAR MCP (5 minutes)

### Where to find it in Cowork
1. In Connectors panel, search for: `linear`
2. Click "Add" → Opens Linear OAuth screen

### Authentication Flow
1. **Sign in to Linear** (if not already)
2. **Select team/workspace:** Choose your Linear workspace
3. **Grant permissions:**
   - ✅ View teams and projects
   - ✅ Create and edit issues
   - ✅ View issue details
4. **Click "Authorize"** → Browser closes
5. Cowork shows ✅ **Connected**

### Your Linear workspace setup
**Create a new project for tracking:**
1. In Linear, click **+ New project**
2. Name: `Financial 101 Master`
3. Keep it **private** or team-only
4. Create labels:
   - `deployment` (red/critical)
   - `data-isolation` (orange/warning)
   - `bug` (red/critical)
   - `optimization` (blue/info)

### Test immediately (paste in Claude)
```
Create a new issue in Linear with:
- Title: "Test: MCP setup validation"
- Description: "If you see this, the Linear connector is working"
- Project: "Financial 101 Master"
- Label: "optimization"
```

**Expected result:** Issue appears in Linear within 2 seconds
- Should have title + description
- Should be in correct project
- Should have the label

**If fails:**
- Check Linear workspace/team selection
- Verify project name (must match exactly)
- Make sure you're in the correct organization

---

## ✅ Validation Checklist

Once all 3 are connected, run these tests:

### Test 1: Supabase Works
```
Query the app_users table and show me how many accounts each user has
```
Should return: List of users with account counts ✅

### Test 2: Slack Works
```
Send a message to #engineering: "All 3 MCP connectors successfully connected! 🎉"
```
Should appear in Slack instantly ✅

### Test 3: Linear Works
```
Create an issue titled "Optimization: All MCPs connected" in the Financial 101 Master project
```
Should appear in Linear within 2 seconds ✅

### Test 4: All Skills Work Together
```
Validate our deployment before pushing to main
```
Should run Deployment Validator skill and complete all 10 checks ✅

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Authorization failed" on MCP | Clear browser cookies, try again, check credentials |
| "Connection timeout" | Check internet connection, try closing/reopening Cowork |
| Supabase: "Invalid API key" | Use ANON key, not service role key |
| Slack: "Channel not found" | Verify channel name with `#` prefix, check spelling |
| Linear: "Project not found" | Create project first, verify exact name |
| Skill won't trigger | Skills need MCPs connected; wait 10 seconds after connecting |

---

## 📝 After Connecting: Next Steps

### 1. Update your .env file
```bash
# Add these to .env.local (DO NOT commit)
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]

# Slack webhook (if using direct alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Linear API token (optional, for direct integration)
LINEAR_API_KEY=[your-api-key]
```

### 2. Deploy changes
```bash
cd ~/Desktop/Claude\ Migration
git add -A
git commit -m "feat: Configure MCP connectors (Supabase, Slack, Linear)"
git push origin main
# Vercel deploys in 1-2 min
```

### 3. Test all 4 skills
- Deployment Validator
- Financial Data Auditor
- Statement Insights
- Account Sync Debugger

### 4. Create Linear tickets for remaining work
- Datadog monitoring setup
- Cloudflare email debugging
- Notion knowledge base

---

## 🎉 Success Indicators

When everything is connected:

✅ **Supabase:** Can query database from Claude  
✅ **Slack:** Messages appear in channel instantly  
✅ **Linear:** Issues created appear in project  
✅ **All skills:** Trigger correctly and run to completion  
✅ **Performance:** All operations complete in <5 seconds

---

## 📞 Quick Reference

| Connector | Status | Last Tested | Notes |
|-----------|--------|-------------|-------|
| Supabase | 🔴 Pending | — | Check API keys |
| Slack | 🔴 Pending | — | Create #engineering channel |
| Linear | 🔴 Pending | — | Create project first |

**To update:** Change 🔴 to 🟢 once you've completed and tested each connection.

---

## Time Breakdown

- Supabase setup: 5 min
- Slack setup: 10 min (includes channel creation)
- Linear setup: 5 min (includes project creation)
- Testing all 3: 5 min
- **Total: ~25 minutes**

Ready? Start with Supabase!
