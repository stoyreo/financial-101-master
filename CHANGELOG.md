# Changelog

All notable changes to Financial 101 Master will be documented in this file.

## [3.5.0] - 2026-05-26

### User Authentication & Self-Service Features

#### New Features

**1. User Signup & Registration**
- New `/signup` page with email + password registration
- 8+ character password validation with confirm password field
- Auto-creates AppUser profile on signup with clean initial state
- Seamless session synthesis and redirect to home page
- Matches login page styling and user experience

**2. Bank Statement Import & Actuals Tracking**
- PDF bank statement upload with AI-powered categorization
- Tested with UOB statements (~80 transactions)
- Smart deduplication to prevent re-upload processing
- Monthly budget vs actual comparison view
- Live expense transaction list with category filtering
- AI-powered "Cuts" feature for expense reduction suggestions
- Savings Optimizer with interactive category sliders

**3. New API Endpoints**
- `POST /api/statements/import` — Upload and process bank statements
- `POST /api/expenses/suggest-cuts` — AI-generated expense reduction recommendations

#### Security Improvements

**1. Multi-User Data Isolation**
- Enhanced Sync API (`/api/sync`) with user authentication
- Users can only access their own `storageKey` (403 Forbidden for unauthorized access)
- Email notifications route to authenticated user (no hardcoded fallback)
- Explicit user email in notification payloads

**2. Session & Store Management**
- Fixed new user data flood: store now clears on signup
- `synthesizeSession()` clears Zustand store before session creation
- Signup page explicitly clears sessionStorage before redirect
- Per-user `storageKey` uniqueness verified via Supabase user ID

#### Bug Fixes

- **New user data inheritance** — Users no longer see previous user's financial data when signing up in same browser session
- **Store state isolation** — sessionStorage properly cleared between user sessions
- **Session persistence** — Data isolation maintained across login/logout/re-login cycles

#### Infrastructure & Deployment

- Repo consolidation: `financial-101-master` is now the canonical repository
- Vercel auto-deployment on `git push origin main`
- Cloud Firestore sync with Google Drive (legacy system preserved)
- Cloudflare Workers email notification system deployed

#### Files Added

```
src/app/signup/page.tsx (350 lines)
src/lib/categorize.ts (200 lines)
src/lib/actuals.ts (180 lines)
src/app/api/statements/import/route.ts (150 lines)
src/app/api/expenses/suggest-cuts/route.ts (110 lines)
src/app/expenses/actuals/page.tsx (430 lines)
src/components/dashboard/SavingsOptimizer.tsx (210 lines)
```

#### Files Modified

```
src/lib/auth.ts (store clearing logic added)
src/lib/store.ts (actuals tracking integration)
src/lib/users.ts (user profile management)
src/lib/types.ts (Actuals type definitions)
src/app/expenses/page.tsx (actuals link added)
src/app/api/sync/route.ts (authentication check)
package.json (version bump to 3.5.0)
```

#### Testing Checklist

- [x] Signup creates new user with clean financial state
- [x] PDF statement import processes 80+ transactions
- [x] Category suggestions work via AI
- [x] Budget vs Actual accurately reflects uploaded data
- [x] Multi-user isolation prevents data leakage
- [x] Session clear prevents data flood on re-signup
- [x] Email notifications deliver to correct user

#### Migration Notes

No breaking changes. All v3.4.0 features remain functional.

---

## [3.4.0] - 2026-04-26

### Member Identity & Empty-Start Fixes

#### Fixed
- **Sidebar identity label** — for `member` and `admin` accounts the upper-left
  label now resolves to the real registry `displayName` (e.g. "Patipat") instead
  of the seed value "Demo User". Demo accounts continue to show "Demo User".
  See `src/components/layout/AppShell.tsx`.
- **Newly-created members no longer inherit demo data.** When an admin adds a
  member from `/admin/users`, that member's first login now starts with a
  completely empty profile and empty income / expense / debt / investment lists.
  Previously every new member got the "Demo User" fixture (`fullName: "Demo User"`,
  DOB 1992-06-15, ฿350,000 cash, Somchai's incomes, etc.). The fixture is now
  only applied for `role="demo"`.
- **`findOrCreateUserByEmail` adopts remote rows.** On a fresh browser, a member
  who logs in via Supabase used to spawn a duplicate local AppUser (role
  re-derived from email, demo data seeded). It now first checks the remote
  `app_users` table for the email and adopts that row's `displayName`, `role`,
  and `storage_key` so the admin-provisioned identity is preserved.

#### Added
- `getEmptySnapshot(displayName)` and `getStartingSnapshot(role, displayName)`
  in `src/lib/users.ts`. The "starting" helper picks demo vs. empty based on
  role and is the new single source of truth for first-login seeding.

#### Changed
- `addUser`, `initUsers`, and `findOrCreateUserByEmail` all route through
  `getStartingSnapshot` instead of unconditionally calling `getDemoSnapshot`.
- Version bumped 3.3.0 → 3.4.0.

## [3.2.0] - 2026-04-16

### Multi-User & DEMO Account System

#### New Features

**1. New User Role: "demo"**
- Added lowest-privilege role alongside `admin` and `member`
- Enables safe testing and demonstration without admin access
- Isolated data namespace (`fp_data_demo`)

**2. DEMO User Account**
- Pre-configured demo account with fake profile data
- Username: `DEMO`
- Authenticates with same hash as admin (secure credential sharing)
- Cannot access admin-only features or endpoints
- Profile includes: name, email, contact info, address, DOB, financial preferences
- Available on both LOCAL (localStorage) and REMOTE (Cloudflare KV)

**3. User Registry & Profile System**
- Users stored in `fp_users_v1` (registry) + individual `fp_data_*` (profiles)
- Idempotent user creation (safe to re-run scripts)
- Profile data completely separate from authentication
- Support for role-based access control (RBAC)

#### Scripts Added

- `scripts/add-demo-user.js` — Initialize DEMO user with profile data (LOCAL)
- `scripts/sync-demo-remote.js` — Sync DEMO to Cloudflare KV (REMOTE)
- `scripts/test-demo-login.js` — Verify DEMO login mechanics

#### Files Modified

- `src/lib/users.ts` — Added `"demo"` role, updated DEFAULT_USERS and initUsers()
- `package.json` — Version bumped to 3.2.0
- `.env.local` — No changes (uses existing admin hash)

#### Data Files Created

- `data/users-registry.json` — User registry (LOCAL)
- `data/user-fp_data_demo.json` — DEMO profile (LOCAL)
- `data/remote-demo-user.json` — DEMO user (REMOTE reference)
- `data/remote-demo-profile.json` — DEMO profile (REMOTE reference)

---

## [3.0.0] - 2026-04-15

### Phase 3: Enhanced Mortgage Simulator & Expert Advisor Skills

#### Major Features Added

**1. Debt Payoff Year Calculator**
- New engine module: `src/lib/engine/debt-payoff.ts`
- Calculates exact payoff year, date, and months remaining for any debt
- Supports edge cases: zero payments, negative values, interest-only loans
- Displays "Fully paid: 2035" on each debt card
- Integrates payoff metrics into debt tracking

**2. Debt Selection System**
- Checkbox interface to select individual debts or "All Debts"
- Debts highlight when selected (visual feedback with border and background)
- Mortgage Simulator uses selected debts for scenario analysis
- Enables targeted payoff simulations for specific debts

**3. AI Insights Engine**
- New module: `src/lib/ai-insights.ts`
- Context-aware recommendations for each menu section
- Analyzes Income menu: diversification, savings rate, discretionary income
- Analyzes Expenses menu: expense ratio, discretionary spending opportunities
- Analyzes Investments menu: tax-advantaged account optimization, portfolio risk
- Analyzes Debts menu: debt service ratio, high-interest debt prioritization
- Analyzes Scenarios menu: retirement timeline risk, long-term growth opportunities
- Returns brief actionable insights (2-3 sentences max)
- Provides 1-3 concrete next steps for each insight
- Includes priority levels (high, medium, low) for decision-making

**4. Expert Advisor Skills**

**Skill 1: Life & Retirement Planner**
- Location: `src/skills/life-retirement-planner/`
- Functions:
  - `analyzeRetirementReadiness()`: Calculates years to retirement, adequacy ratio, gaps
  - `suggestLifeMilestones()`: Recommends savings targets by life stage (ages 25-65+)
  - `projectRetirementIncome()`: Estimates retirement cash flow and sustainability
- Features:
  - Retirement readiness assessment with 5-year, 10-year, 15-year projections
  - Life stage savings milestones (Foundation, Acceleration, Peak, Distribution)
  - Safe withdrawal rate calculations (4% rule)
  - Pension and investment income integration

**Skill 2: Investment Expert Advisor**
- Location: `src/skills/investment-expert/`
- Functions:
  - `optimizeAssetAllocation()`: Recommends allocation percentages based on risk profile
  - `analyzePortfolioRisk()`: Risk metrics, concentration analysis, diversification score
  - `projectInvestmentReturns()`: Return projections under multiple scenarios
- Features:
  - Risk-based allocation strategies (conservative, moderate, aggressive)
  - Time-horizon adjustments (shorter horizons = more conservative)
  - Concentration ratio calculations (Herfindahl index)
  - Diversification scoring (0-100 scale)
  - Return projections with confidence levels (10th, 30th, 50th, 70th, 90th percentiles)
  - Inflation-adjusted return analysis

#### UI Improvements

- Debt cards now display payoff year prominently
- Debt cards show "Fully paid: [YEAR]" with time remaining in months
- Selection checkboxes on debt cards for mortgage simulator
- Payoff metrics update in real-time as payments change
- Better visual feedback for selected debts (primary color highlight)

#### Technical Improvements

- New utility functions in `debt-payoff.ts`:
  - `calculatePayoffYear()`: Core payoff calculation
  - `formatPayoffDisplay()`: User-friendly formatting
  - `calculateMultiplePayoffs()`: Batch payoff calculations
- New AI insights module with 5 menu-specific analysis functions
- Expert skill structure with clear function interfaces
- Better separation of concerns (engine vs. UI)

#### Bug Fixes

- Fixed payoff calculation for zero-payment loans (now shows "Never")
- Corrected monthly payment calculations in debt cards
- Improved handling of edge cases in payoff metrics

#### Performance

- Debt payoff calculations are O(1) - instant computation
- AI insights cache friendly (minimal re-renders)
- Mortgage simulator selector doesn't impact performance

#### Documentation

- SKILL.md files for both expert advisors
- Clear function signatures and parameter descriptions
- Example queries for each skill
- Category tags for skill discovery

### Version Information

- **Version:** 3.0.0
- **Build Date:** 2026-04-15
- **Node.js:** ^14.0.0
- **Next.js:** 14.2.29
- **React:** ^18

### Migration Notes

No breaking changes from V2.x. All existing features remain functional and unchanged.

### Files Added

```
src/lib/engine/debt-payoff.ts
src/lib/ai-insights.ts
src/skills/life-retirement-planner/SKILL.md
src/skills/life-retirement-planner/functions.ts
src/skills/investment-expert/SKILL.md
src/skills/investment-expert/functions.ts
START V3.bat
```

### Files Modified

```
src/app/debts/page.tsx (added checkbox selection + payoff year)
package.json (version bump to 3.0.0)
```

---

## [2.0.0] - Previous Release

Refer to RELEASE_NOTES.md for Phase 2 features.

---

## Support

For issues or feature requests, please create an issue in the project repository.
