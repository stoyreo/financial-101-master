export const APP_VERSION = "3.9.0";
export const BUILD_DATE = "2026-07-09";

// Format version with date for display: "v3.4.0 • May 12, 2026"
export function getVersionDisplay(): string {
  const date = new Date(BUILD_DATE);
  const formatted = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `v${APP_VERSION} • ${formatted}`;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "3.9.0",
    date: "2026-07-09",
    changes: [
      "Google Gemini Flash (free AI Studio tier) added as a hosted AI provider and made the DEFAULT — provider order is now Gemini → local Ollama → Claude, so AI features work free on Vercel where localhost Ollama is unreachable",
      "New model picker next to every AI trigger button (Live Coach, AI Match, AI Scan, fund forecasts, scenario analysis, payslip import, slip OCR, Fin chat) — choose Auto, Gemma (local), Gemini Flash (free), or Claude before each request; the choice is shared app-wide",
      "Slip OCR and payslip extraction now run through the unified vision provider (Gemini vision first, Claude fallback) instead of calling Claude directly",
      "Fin avatar's provider dropdown gained Gemini Flash and now drives the same shared model preference as the pickers",
    ],
  },
  {
    version: "3.8.0",
    date: "2026-06-07",
    changes: [
      "Fin, the AI avatar, is now available app-wide — one floating 'Ask Fin' launcher (drag, throw, and live Claude streaming chat) mounted globally instead of only on Actuals",
      "Pages can register their own financial snapshot for Fin to reason about (e.g. Actuals hands over its budget-vs-actual data); other pages fall back to a generic whole-of-plan snapshot (income, expenses, debts, investments, net worth)",
      "Fixed LINE sign-in redirect loop: middleware was treating /auth/line/callback as a protected route (only /auth/callback was allowlisted) and bouncing the OAuth redirect back to /login before the code could be exchanged — now all /auth/* callback routes stay reachable pre-session",
    ],
  },
  {
    version: "3.7.0",
    date: "2026-06-04",
    changes: [
      "Scoped localStorage keys by userId in snapshots, version-log, backup, and LINE UID (prevents cross-user data leakage)",
      "Fixed migration.ts hardcoded account ID — now uses real session userId with admin-only guard",
      "Scoped migration flag per-user to prevent skipped migrations on shared browsers",
      "Fixed accounts.ts: createdAt no longer regenerated on every getCurrentAccount() call",
      "Updated store.ts comment to reflect sessionStorage (not localStorage) persistence",
      "Documented /api/budgets dual-caller design (LINE bot vs browser)",
    ],
  },
  {
    version: "3.6.1",
    date: "2026-05-30",
    changes: [
      "Fixed remote sync: AuthGuard now hydrates data from the server on login, so changes actually save (resolves stuck 'Not yet hydrated from remote')",
      "Fixed /api/sync 'Remote: error': server now resolves users by Supabase ID when the auth email differs from the registered account email",
    ],
  },
  {
    version: "3.6.0",
    date: "2026-05-30",
    changes: [
      "Fixed /expenses/actuals crash for email/password and Google OAuth users",
      "All auth paths now bridge Supabase session — AutoSync and data loading work correctly",
      "Logout now clears the Zustand store to prevent cross-user data leakage",
      "Store switched from localStorage to sessionStorage with one-time data migration",
      "Signup page now respects ?redirectTo= param",
      "GET /api/admin/users now requires admin role",
      "LINE receipt links (/line/view) no longer require login",
      "Suspense boundaries added to login, signup, and actuals pages",
      "Removed duplicate Finder files and debug test files from repository",
      "Personal financial data removed from public repository",
    ],
  },
    {
    version: "3.5.0",
    date: "2026-05-26",
    changes: [
      "New user signup & registration at /signup with email + password form",
      "Bank statement import with AI-powered transaction categorization (PDF UOB, KBank, SCB, KTC, TMB)",
      "Actuals tracking: budget vs actual comparison with monthly trend analysis",
      "LINE Expense Tracker integration for real-time transaction sync",
      "Savings Optimizer with interactive category sliders for expense reduction",
      "Multi-user data isolation: users can only access their own storageKey (403 Forbidden)",
      "Fixed new user data flood: store now clears properly on signup to prevent cross-user data leakage",
      "Collapsed LINE sync panel: minimal indicator by default, expands on click for cleaner UI",
      "Grouped LINE transactions in Statement History: multiple syncs on same date collapse into one row",
    ],
  },
  {
    version: "3.4.0",
    date: "2026-05-12",
    changes: [
      "Updated version display to include date — now shows 'v3.4.0 • May 12, 2026' format",
      "Synced version log with live artifacts from Financial 101 Dashboard",
      "Enhanced VersionPanel with version + date display throughout the app",
      "Sidebar identity label now shows the real account display name for member/admin roles instead of falling back to 'Demo User'",
      "Newly-created member accounts start with a completely empty profile and empty income/expense/debt/investment lists - no more demo fixture seeded under member namespaces",
      "findOrCreateUserByEmail now adopts the admin-provisioned remote app_users row on first login (correct displayName, role, storage_key) instead of creating a duplicate local user with demo seed data",
      "Demo accounts (role=\"demo\") still receive the full demo snapshot - only member/admin starts blank",
    ],
  },
  {
    version: "3.3.0",
    date: "2026-04-16",
    changes: [
      "Replaced legacy Patipat demo account with generic 'Demo Member' — no real personal data in demo",
      "All seed data now uses clearly fake/sample values (Somchai profile, sample banks, generic amounts)",
      "Import confirmation popup with real-time sync status (local save + remote sync indicators)",
      "Import now triggers automatic save to localStorage and remote server after successful upload",
      "Version bump to 3.3.0",
    ],
  },
  {
    version: "3.1.0",
    date: "2026-04-16",
    changes: [
      "Admin can now create new users from Account Management page",
      "New users get completely isolated data namespaces",
      "New users start with demo data (can be reset anytime)",
      "Deployment notification emails sent to stakeholders",
      "Version update logging system with welcome popup on new version",
      "Account Management page fully restored for admin use",
      "Enhanced user creation with one-click isolated account setup",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-04-15",
    changes: [
      "Phase 3 - Enhanced Mortgage & Single-Account Simplification",
      "Removed account switching feature — simplified to single-account workflow",
      "Fixed email notifications: now sending to toy.theeranan@gmail.com",
      "Google Drive backup with on-demand sync button",
      "Backup completion popup — shows success message for 3 seconds after upload",
      "Fixed wrangler.toml TOML syntax error and Pages build configuration",
      "Cloudflare Worker email alerts now fully functional",
      "Improved backup reliability with error handling",
    ],
  },
  {
    version: "1.0.1",
    date: "2025-04-14",
    changes: [
      "Multi-user support: Admin and Demo Member with fully isolated data namespaces",
      "Login page redesigned with user-picker cards — select account then enter password",
      "Demo Member account: full read-write access on own segregated dataset (starts from demo seed)",
      "Account Management page (/accounts) — Admin only: edit users, reset passwords, reset demo data",
      "OneDrive Auto-Backup: saves to chosen folder every 30 min + on tab close, keeps last 30 files",
      "Backup widget in sidebar shows last backup time, one-click Backup Now",
      "Version panel updated with Changelog + Saved Versions (snapshot) tabs",
      "Cloudflare Pages deployment support with static export",
      "Email login alerts via Cloudflare Worker + Resend API (IP, city, country, browser)",
      "SHA-256 password hashing, 8-hour sessions, Sign Out button",
      "iOS / Chrome mobile: bottom tab nav, safe-area insets, touch-optimised",
      "START - Localhost.bat and START - Remotehost.bat for local and cloud launch",
      "Auto-save to per-user localStorage namespace on every data mutation (1.5s debounce)",
    ],
  },
  {
    version: "1.0.0",
    date: "2025-04-14",
    changes: [
      "Initial release with full financial planning app",
      "Dashboard, Income, Expenses, Debts, Investments, Tax, Scenarios, Forecast pages",
      "Real debt data: KKP Thawee x2, CIMB Greenville, LH Whizdom (฿16.28M total)",
      "Mortgage amortization engine with extra-payment simulator and scenario compare",
      "Thailand PIT tax engine with deduction optimiser",
      "Scenario planner with 5 built-in scenarios and side-by-side comparison charts",
      "Yearly forecast to age 90, monthly 5-year detail, milestone detection",
      "Dark mode, export/import JSON, Reset to seed data",
    ],
  },
];
