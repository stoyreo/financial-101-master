# Financial 101 Master — Release Protocol

**Last Updated:** May 11, 2026  
**Status:** Active — All changes require explicit release approval

---

## 🚀 Change Management Workflow

### Phase 1: Development (No Auto-Updates)
- **Version Control:** All changes to web app tracked in git branches
- **Branch Naming:** `feature/`, `fix/`, `docs/`, `chore/` prefixes
- **Development Artifacts:** Work on feature branches — NOT on main/production
- **Testing:** All changes tested locally before proposing release

### Phase 2: Change Proposal (Explicit Approval)
- **Trigger:** When any web app file changes, PAUSE and create a **Release Proposal**
- **Release Proposal Must Include:**
  - Feature/fix description
  - Files changed (list)
  - Breaking changes (if any)
  - Testing done
  - Rollback plan
  - Target deployment date

- **Example Release Proposal:**
  ```
  ## Release: v3.1.0 — Dashboard Mobile Optimization
  
  ### Changes
  - Updated responsive grid layouts (768px, 480px breakpoints)
  - Fixed chart rendering memory leaks
  - Improved color contrast for accessibility
  
  ### Files Modified
  - src/app/dashboard.tsx (+120 lines)
  - src/lib/charts.ts (+35 lines)
  - styles/dashboard.css (+45 lines)
  
  ### Testing
  ✓ Manual: tested on iPhone 12, iPad Air, desktop
  ✓ Unit: 14 tests pass
  ✓ E2E: critical flows verified
  
  ### Rollback Plan
  Tag v3.0.4 as fallback (if needed in first hour post-deploy)
  
  ### Risk Level: LOW
  - No data schema changes
  - No API changes
  - CSS-only + UI-only changes
  
  ### Approval Required: YES
  ```

### Phase 3: Release Approval
- **Decision Gate:** Each release proposal goes to stakeholder review
- **Approval Steps:**
  1. Code review (syntax, logic, data isolation ✓)
  2. Risk assessment (LOW/MEDIUM/HIGH)
  3. Deployment window check (business hours, user impact)
  4. Sign-off by: `[Theeranan or designated release lead]`

### Phase 4: Deployment
- **Pre-Deploy Checklist:**
  - [ ] Backup production database
  - [ ] Record git commit hash deployed
  - [ ] Notify team (Slack: #releases channel)
  - [ ] Monitor error logs for 30 minutes post-deploy

- **Deployment Command:**
  ```bash
  # Tag the release
  git tag -a v3.1.0 -m "Dashboard mobile optimization"
  git push origin v3.1.0
  
  # Deploy to production
  npm run build
  npm run deploy -- --version v3.1.0
  ```

- **Post-Deploy:**
  - Monitor Sentry/error tracking for 1 hour
  - Check analytics for anomalies
  - User feedback monitoring

### Phase 5: Documentation
- **Update CHANGELOG.md:**
  ```markdown
  ## [3.1.0] - 2026-05-11
  ### Added
  - Mobile-responsive dashboard (480px, 768px breakpoints)
  ### Fixed
  - Chart memory leaks in Tab switching
  - Color contrast issues (WCAG AA compliance)
  ### Changed
  - Grid layout recalculation for tablets
  ```

- **Update DEPLOYMENT.md:**
  - Deployment date: May 11, 2026
  - Deployed by: [Your name]
  - Commit hash: abc1234...
  - Rollback tag: v3.0.4 (if needed)

---

## 📋 Release Tracking Template

**Use this every time you want to release:**

```
┌─────────────────────────────────────────────────────┐
│ RELEASE PROPOSAL — Financial 101 Master              │
├─────────────────────────────────────────────────────┤
│ Version:          v?.?.?                             │
│ Title:            [Feature description]              │
│ Type:             [ ] Feature [ ] Fix [ ] Hotfix    │
│ Created:          [date]                             │
│ Proposed Deployment: [date/time]                    │
├─────────────────────────────────────────────────────┤
│ CHANGES                                              │
│ • File 1: brief description                         │
│ • File 2: brief description                         │
│ Breaking changes: YES / NO — explain                │
├─────────────────────────────────────────────────────┤
│ TESTING COMPLETED                                    │
│ ✓ Unit tests:        [number]                       │
│ ✓ Manual QA:         [devices/platforms tested]     │
│ ✓ Regression check:  [critical flows verified]      │
├─────────────────────────────────────────────────────┤
│ RISK ASSESSMENT                                      │
│ Risk Level:  [ ] LOW [ ] MEDIUM [ ] HIGH           │
│ Data Isolation: ✓ VERIFIED (no leakage)            │
│ Performance: ✓ VERIFIED (no degradation)           │
├─────────────────────────────────────────────────────┤
│ APPROVALS                                            │
│ Technical Review:     ☐ Approved        Date: __     │
│ Product/Business:     ☐ Approved        Date: __     │
│ Security (if needed): ☐ Approved        Date: __     │
├─────────────────────────────────────────────────────┤
│ ROLLBACK PLAN                                        │
│ Fallback version:     v?.?.?                         │
│ Rollback duration:    [how long can you wait?]      │
│ Rollback procedure:   [command to revert]           │
├─────────────────────────────────────────────────────┤
│ DEPLOYMENT                                           │
│ [ ] Ready to deploy   Approver: __________           │
│ [ ] HOLD — Reason:                                  │
│ [ ] CANCELLED — Reason:                             │
└─────────────────────────────────────────────────────┘
```

---

## 🔒 Non-Negotiable Rules

1. **NO auto-updates** — Every change requires explicit approval
2. **Every release = proposal** — Even small CSS tweaks
3. **Data isolation verified** — Check CLAUDE.md checklist before each release
4. **Changelog + DEPLOYMENT.md updated** — Before deployment
5. **Rollback plan ready** — Every. Single. Time.
6. **Test on mobile** — Not just desktop (Financial 101 has mobile users)

---

## 📊 Release Cadence

- **Hotfixes (Critical bugs, security):** ASAP approval, 24hr max
- **Feature releases:** Weekly window (Mon–Wed preferred)
- **Maintenance/docs:** No review needed, merge to main directly

---

## ✅ Compliance Checklist

Before proposing ANY release:

- [ ] All code changes committed to branch (not on main)
- [ ] Code review complete (self + peer)
- [ ] **Data isolation verified** per CLAUDE.md (critical!)
- [ ] Tests passing (unit + manual)
- [ ] CHANGELOG.md updated
- [ ] Release proposal document filled out
- [ ] Rollback tag created in git
- [ ] Stakeholder notified

---

## 🎯 Next Steps

1. **When you want to deploy:** Create a release proposal (use template above)
2. **Share with Theeranan:** Submit for approval
3. **Once approved:** Follow Phase 4 deployment steps
4. **After live:** Monitor for 1 hour, document in DEPLOYMENT.md

---

## Questions?

- **"Can I push directly to main?"** — No. Branch → PR → approval → merge → tag → deploy
- **"What if it's urgent?"** — Still do proposal + approval (take 30 min instead of 1 day)
- **"Do I document all CSS tweaks?"** — Yes. Small changes still need changelog entry
- **"How long is version history kept?"** — Keep last 5 releases as rollback options
