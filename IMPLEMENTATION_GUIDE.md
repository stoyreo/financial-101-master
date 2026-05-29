# Implementation Guide: Optimization Rollout
**Date:** May 29, 2026  
**Status:** Skills created ✅ | Connectors pending | Testing ready

---

## ✅ Completed: 4 Critical Skills Created

All skills are in `src/skills/`:
1. **deployment-validator/** — Pre-deploy safety checks
2. **financial-data-auditor/** — Multi-user data isolation audit
3. **statement-insights/** — Bank statement analysis
4. **account-sync-debugger/** — Multi-account troubleshooting

Each skill is production-ready with:
- ✅ Comprehensive SKILL.md documentation
- ✅ Clear triggers and use cases
- ✅ Step-by-step troubleshooting guides
- ✅ Code examples and SQL snippets
- ✅ Common issues + fixes

---

## ⏭️ Next Steps (This Week)

### STEP 1: Connect Tier 1 MCPs (20 minutes)
**Why:** Immediate ROI on visibility + data auditing

**Supabase MCP** (5 min)
1. In Cowork, search for "Supabase" connector
2. Click "Add" → authorize with your Supabase account
3. Test: Run this prompt in Claude:
   ```
   "Show me all users in the app_users table with their account counts using Supabase"
   ```
   ✅ Expected: List of all users + their account counts
   ❌ If fails: Check Supabase credentials

**Slack MCP** (10 min)
1. In Cowork, search for "Slack" connector
2. Click "Add" → select your workspace → authorize
3. Test: Run this prompt:
   ```
   "Send a test message to #general saying 'Financial 101 optimization rollout started'"
   ```
   ✅ Expected: Message appears in #general
   ❌ If fails: Check Slack workspace permissions

**Linear MCP** (5 min)
1. In Cowork, search for "Linear" connector
2. Click "Add" → authorize with your Linear workspace
3. Test: Run this prompt:
   ```
   "Create a new issue in Linear titled 'Test: Optimization Rollout' with description 'Testing Linear integration'"
   ```
   ✅ Expected: Issue appears in Linear
   ❌ If fails: Check Linear workspace access

**After connecting all 3:**
```bash
cd ~/Desktop/Claude\ Migration
git add -A
git commit -m "feat: Add MCP connectors (Supabase, Slack, Linear)"
git push origin main
# Vercel deploys automatically in 1-2 min
```

---

### STEP 2: Package Skills as Cowork Plugins (30 minutes)
**Why:** Make skills shareable + professional deployment

Each skill becomes a `.plugin` file (zip archive):

```bash
# From your project root:
cd src/skills

# Package each skill
zip -r deployment-validator.plugin deployment-validator/
zip -r financial-data-auditor.plugin financial-data-auditor/
zip -r statement-insights.plugin statement-insights/
zip -r account-sync-debugger.plugin account-sync-debugger/

# Move to outputs folder for easy access
mv *.plugin ~/Desktop/Claude\ Migration/
```

**Then in Cowork:**
1. Search for "skill creator" → click skill to load it
2. Use it to install `.plugin` files as personal skills
3. Verify each skill triggers:
   - `deployment-validator`: Ask "are we ready to deploy?"
   - `financial-data-auditor`: Ask "audit data isolation"
   - `statement-insights`: Ask "analyze my statement"
   - `account-sync-debugger`: Ask "debug account switching"

---

### STEP 3: Test All Skills + Connectors (1-2 hours)
**Why:** Catch issues before production use

**Deployment Validator:**
```
Prompt: "Validate our deployment before pushing to main"
Expected: ✅ PASS on all 10 checks (no issues)
If fails: Fix the issue before deploying
```

**Financial Data Auditor:**
```
Prompt: "Audit data isolation for user toy.theeranan@gmail.com"
Expected: ✅ PASS all checks (no cross-account leakage)
If fails: Check for hardcoded accountIds or RLS issues
```

**Statement Insights:**
```
Prompt: "I uploaded a bank statement. What spending patterns do you see?"
Expected: Narrative with trends, anomalies, savings ideas
If fails: Verify statement was imported correctly
```

**Account Sync Debugger:**
```
Prompt: "Debug account switching - is Zustand store correct?"
Expected: Full diagnostic of current user, accounts, cache, sync status
If fails: Check localStorage vs sessionStorage isolation
```

**Slack Integration:**
```
Prompt: "Send a deployment notification to #engineering: 'v3.1 deployed successfully'"
Expected: Message appears in Slack within 2 seconds
If fails: Check Slack token + channel permissions
```

**Linear Integration:**
```
Prompt: "Create a bug ticket in Linear: 'Session timeout not working correctly'"
Expected: Ticket appears in Linear with description
If fails: Check Linear workspace access
```

---

### STEP 4: Create Deployment Runbook (optional, 30 min)
**Why:** Standardize pre-deploy process

Save this as `DEPLOYMENT_RUNBOOK.md`:

```markdown
# Deployment Runbook

## Pre-Deployment (5 min)
1. Run Deployment Validator skill
   ```
   "Validate our deployment before pushing to main"
   ```
   ✅ All checks must PASS before proceeding

2. Run Financial Data Auditor
   ```
   "Quick audit: any data isolation issues?"
   ```
   ✅ Must show no cross-account leakage

3. Verify git status clean
   ```bash
   git status
   ```
   ✅ No untracked files

## Deployment (2 min)
```bash
cd ~/Desktop/Claude\ Migration
git push origin main
# Vercel auto-deploys — watch logs at https://vercel.com
```

## Post-Deployment (5 min)
1. ✅ Wait for Vercel to complete (usually 1-2 min)
2. ✅ Test signup at https://financial101.vercel.app/signup
3. ✅ Test login with new user
4. ✅ Test account switching
5. ✅ Check email delivery (both recipients)
6. ✅ Post to #engineering: "v3.X deployed successfully" (via Slack MCP)

## Rollback (if needed)
```bash
git revert HEAD
git push origin main
# Vercel redeploys to previous version
```
```

---

### STEP 5: Document in Linear (10 min)
Create a project "Financial 101 Master" with:
- **Feature labels:** deployment, data-isolation, optimization
- **Bug labels:** critical, urgent, medium
- **Epic:** "Optimization Rollout (May 29)"

Add tickets for remaining items:
- Datadog integration setup
- Cloudflare MCP for email debugging
- Notion knowledge base setup
- Monthly data isolation audits

---

## 📋 Summary: What's Done vs What's Next

| Item | Status | Effort | Impact |
|---|---|---|---|
| **Deployment Validator skill** | ✅ Done | — | 🔴 Critical (prevents bad deploys) |
| **Financial Data Auditor skill** | ✅ Done | — | 🔴 Critical (prevents data leaks) |
| **Statement Insights skill** | ✅ Done | — | 🟡 High (UX improvement) |
| **Account Sync Debugger skill** | ✅ Done | — | 🟡 High (debugging tool) |
| Supabase MCP | ⏳ Pending | 5 min | 🟢 High (data visibility) |
| Slack MCP | ⏳ Pending | 10 min | 🟢 High (team comms) |
| Linear MCP | ⏳ Pending | 5 min | 🟡 Medium (task tracking) |
| Package skills as .plugins | ⏳ Pending | 30 min | 🟢 Medium (sharing) |
| Test all skills + connectors | ⏳ Pending | 1-2 hrs | 🔴 Critical (validation) |
| Datadog MCP | 🗓️ Next week | 20 min | 🟡 High (monitoring) |
| Cloudflare MCP | 🗓️ Next week | 10 min | 🟡 Medium (debugging) |
| Notion MCP | 🗓️ Next week | 15 min | 🟢 Low (docs) |

**Total effort this week:** ~2-3 hours  
**Expected ROI:** 14-20 hrs/month saved + critical risk reduction

---

## 🚀 Quick Start Command Cheat Sheet

```bash
# Test one skill immediately
cd ~/Desktop/Claude\ Migration

# (In Claude conversation)
# "Validate our deployment before pushing to main"
# Expected: Detailed pre-deployment check

# Test Supabase connector (after connecting)
# "List all users in app_users table"
# Expected: All users with account info

# Test Slack connector (after connecting)
# "Send a test message: 'Optimization complete'"
# Expected: Message in Slack

# Deploy changes
git add -A
git commit -m "feat: Add optimization skills (Validator, Auditor, Insights, Debugger)"
git push origin main
```

---

## ⚠️ Important Notes

1. **Skills are local** — They live in `src/skills/` and trigger based on prompts
2. **Connectors require authentication** — Do this through Cowork UI, not CLI
3. **Skills + Connectors complement each other** — Skills define logic, connectors provide data
4. **Test before deploying** — Run validation skill before `git push`
5. **Document all procedures** — Add to Linear tickets for future reference

---

## 🔗 Related Documents

- `OPTIMIZATION_RECOMMENDATIONS.md` — Full connector/skill details
- `CLAUDE.md` — Data isolation checklist (critical!)
- `RECENT_WORK.md` — Deployment history + incident summaries
- `src/skills/*/SKILL.md` — Individual skill documentation

---

## ❓ FAQ

**Q: Can I use skills before connecting MCPs?**  
A: Yes! Skills work independently. MCPs just add connectors (Slack, Linear, etc.). Start with skills to get immediate value.

**Q: What if a skill triggers incorrectly?**  
A: Update the `description` field in SKILL.md — it controls triggering. Check the skill-creator guide for optimization.

**Q: How do I share skills with teammates?**  
A: Package as .plugin files (see Step 2). They install in their Cowork instance via "Add skill".

**Q: Can I modify skills after deployment?**  
A: Yes! Edit the SKILL.md files anytime. Changes take effect immediately in Cowork.

---

**Next action:** Start with STEP 1 (connecting 3 MCPs) — should take ~20 minutes for major immediate ROI.

Good luck! 🚀
