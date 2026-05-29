---
name: deployment-validator
description: Pre-deployment safety checks before pushing to production. Use this whenever the user is about to deploy (git push origin main), or asks "ready to ship?", "validate deployment", "pre-deploy check", "should I deploy?", or wants to verify the codebase is deployment-safe. Checks for hardcoded secrets, shell escape artifacts (!), TypeScript syntax errors, missing environment variables, database migration compatibility, Supabase auth.users sync, and UAT test results. This skill prevents broken or insecure code from reaching production.
compatibility: Node.js, bash, access to project root
---

## Overview

This skill performs a comprehensive pre-deployment safety audit of your Financial 101 Master codebase before you push to main (which auto-deploys via Vercel).

## Checklist

Before running deployment, verify EACH of these:

1. **No hardcoded secrets** — Scan for API keys, database URLs, OAuth secrets in staged files
2. **No shell escapes** — Check for `!` artifacts (bash history expansion) in TypeScript files (breaks SWC)
3. **Environment variables defined** — All `process.env.*` calls have corresponding `.env.example` entries
4. **TypeScript builds cleanly** — `npm run build` passes without errors
5. **Database migrations compatible** — Supabase schema changes don't break existing queries
6. **Auth sync healthy** — `auth.users` count matches `app_users` count (within 1 for pending signups)
7. **Data isolation boundaries intact** — No hardcoded accountIds, sessionStorage used not localStorage
8. **UAT tests passing** — Your 156+ automated test cases pass
9. **Git status clean** — No untracked files that should be .gitignore'd
10. **Recent deploy logs** — Last Vercel deployment succeeded

## How to use

**Ask Claude to validate:**
```
"Are we ready to deploy? Run a deployment check."
```

**Expected output:**
A detailed report with:
- ✅ PASS / ❌ FAIL status for each check
- 🚨 Critical issues (blocks deployment)
- ⚠️ Warnings (should fix before deploying)
- ℹ️ Info (good to know, not blocking)
- Remediation steps for any failures

## Critical vs Warning

**Critical (blocks deployment):**
- Hardcoded secrets found in staged files
- Shell escape artifacts in TypeScript
- TypeScript build failures
- auth.users/app_users count mismatch >1
- Hardcoded accountIds detected

**Warnings (should fix but won't block):**
- Missing .env.example entries
- Failing UAT tests
- Untracked files in git
- Last deploy failed (likely recovered, but verify)

## Remediation Examples

### Shell escape found in src/lib/auth.ts
**Problem:** Line 42 has `!` instead of properly escaped form  
**Fix:** Edit file, replace escaped sequences with unescaped form  
**Why:** Bash escaped the `!` when writing via heredoc; must use direct file editor instead

### Hardcoded secret in backup-config.env
**Problem:** `ANTHROPIC_API_KEY=sk-...` in staged files  
**Fix:** Move to `.env.local` (git-ignored) or `.env.example` (no value)  
**Why:** Secrets in git history = vulnerability, even if deleted later

### auth.users (5) vs app_users (4) mismatch
**Problem:** Signup might not have synced to app_users yet  
**Fix:** Wait 10 seconds, recheck. If still mismatched, check POST /api/admin/users logs  
**Why:** Race condition in auth sync; usually resolves on retry

## Script reference

This skill uses these underlying checks (you can run them manually if needed):

```bash
# Check for shell escapes
npm run prebuild  # runs scripts/check-shell-escapes.mjs

# Check for hardcoded secrets
grep -r "sk-" src/ --include="*.ts" --include="*.tsx"
grep -r "ANTHROPIC_API_KEY=" src/ --include="*.ts"

# TypeScript build
npm run build

# Auth sync
curl -X GET http://localhost:3000/api/admin/users-sync-status

# UAT tests (if applicable)
npm test -- --testPathPattern="uat|UAT"
```

## Notes

- Run this **immediately before `git push origin main`**
- All checks complete in <2 minutes
- If deployment fails after passing these checks, review Vercel logs for runtime errors
- Post-deployment: verify at https://financial101.vercel.app and check email delivery

## See also

- [Data Isolation Auditor](../financial-data-auditor/SKILL.md) — Deep-dive audit of per-user data boundaries
- [Account Sync Debugger](../account-sync-debugger/SKILL.md) — Diagnose account switching issues
- [Recent Work & Status](../../RECENT_WORK.md) — Deployment procedure and history
