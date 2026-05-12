# Haiku Agent Handoff — Wipe Somchai Seed, Make New Accounts 100% Blank

**Copy everything below the `=== PROMPT START ===` line into the Haiku agent. It is self-contained.**

---

## Background for the human (NOT for Haiku)

The "Somchai" data the user keeps seeing on every login is **not a cache bug** — it is the seed dataset hard-wired as the initial Zustand store state and as the post-login reset target in `synthesizeSession()` / `clearSession()`. Every fresh login renders Somchai before the server GET completes. The fix is to stop using `seedProfile`/`seedIncomes`/etc. anywhere a real user could land, replace them with an empty snapshot, and clean any already-corrupted server rows.

`getEmptySnapshot()` already exists in `src/lib/users.ts` (lines ~202–229) but is only partially empty (still uses seed retirement / tax / scenarios) and is not called from the three boot/reset sites that matter.

---

=== PROMPT START ===

# Task: Eliminate "Somchai" demo data from the Financial 101 Master app

You are Claude Haiku working on the codebase at `/Users/stoyreo/Desktop/Claude Migration` (a Next.js + Supabase + Zustand app deployed to Vercel). The user is `Toy` (admin email `toy.theeranan@icloud.com`).

## What's broken

Every time any user logs in, the dashboard greets "Good day, Somchai 👋" and shows seeded Thai-financial-profile numbers (mortgage ฿5.12M, etc.) before — and sometimes instead of — their real data. The seed data is named "Somchai" and lives in `src/lib/seed.ts` as `seedProfile`, `seedIncomes`, `seedExpenses`, `seedDebts`, `seedInvestments`, `seedRetirement`, `seedTax`, `seedScenarios`.

It bleeds into real users in three ways:

1. **Initial Zustand state** boots with `seedProfile` etc. (`src/lib/store.ts` ~lines 156–165).
2. **`synthesizeSession()` reset** in `src/lib/auth.ts` (~lines 73–109) sets the store to `seedMod.seedProfile` etc. on every login.
3. **`clearSession()` reset** in `src/lib/auth.ts` (~lines 134–158) sets the store to `seedProfile` etc. on every logout.
4. **New-user creation** in `src/app/accounts/page.tsx` (~lines 52, 89) calls `persistUserData(user.storageKey, getDemoSnapshot())` — saves Somchai data as the new user's starting state.

Plus, any user whose server row got polluted by an earlier auto-sync push of seed data still has "Somchai" stored in Supabase `user_data`.

## Goal

Two outcomes:
- **A.** Brand-new accounts must show 100% blank financial data — no incomes, no expenses, no debts, no investments, no transactions, profile name = whatever they signed up with (or empty), no Thai-specific defaults bleeding through.
- **B.** Existing accounts whose Supabase `user_data` row contains seed/Somchai data must be cleaned.

`seed.ts` is allowed to remain in the codebase **only** as fixture data for the `role === "demo"` path and for unit tests. It must not be reachable from any production login flow.

## Hard rules

- **Never edit `.ts` / `.tsx` files via bash heredocs / `sed` / `echo >`.** Use the Edit / Write tools only. The project's `prebuild` script runs `scripts/check-shell-escapes.mjs` and will fail the Vercel build if you produce `\!` or `\$` escape artifacts.
- **Do not modify `src/app/api/sync/route.ts`.** Its server-side authorization is already correct — touching it risks data leakage. Read-only.
- **Do not delete `src/lib/seed.ts`.** It's still imported by the demo-role path. Leave the file; just stop calling it from real-user flows.
- **Do not run `git push`.** Stage and commit only. The user will push.

---

## Step 1 — Strengthen `getEmptySnapshot()` to be truly blank

**File:** `src/lib/users.ts`

Find `export function getEmptySnapshot(displayName: string = "")` (currently around lines 202–229). It still references `seedRetirement`, `seedTax`, and `seedScenarios`. Replace its body so retirement, tax, and scenarios are also blank/generic — not Somchai-flavored.

Replace the whole function with:

```ts
export function getEmptySnapshot(displayName: string = "") {
  return {
    profile: {
      id: crypto.randomUUID(),
      fullName: displayName,
      dateOfBirth: "",
      retirementAge: 60,
      lifeExpectancy: 85,
      country: "",
      currency: "THB",
      planningStartDate: new Date().toISOString().slice(0, 10),
      maritalStatus: "Single" as const,
      householdNotes: "",
      emergencyFundTargetMonths: 6,
      targetMinCashBalance: 0,
      riskProfile: "moderate" as const,
      notes: "",
      currentCashBalance: 0,
    },
    incomes: [],
    expenses: [],
    debts: [],
    investments: [],
    retirement: {
      retirementAge: 60,
      expectedAnnualExpense: 0,
      inflationRate: 0.03,
      portfolioReturnPreRetirement: 0.06,
      portfolioReturnDuringRetirement: 0.04,
      safeWithdrawalRate: 0.04,
      pensionMonthlyAmount: 0,
      ssoMonthlyBenefit: 0,
    },
    tax: {
      annualGrossIncome: 0,
      personalDeduction: 60_000,
      employmentIncomeDeduction: 100_000,
      pvdContribution: 0,
      rmfContribution: 0,
      ssfContribution: 0,
      lifeInsurancePremium: 0,
      healthInsurancePremium: 0,
      mortgageInterestDeduction: 0,
      parentalDeduction: 0,
      childDeduction: 0,
      otherDeductions: 0,
      annualBonus: 0,
    },
    scenarios: [
      {
        id: "base",
        name: "Base Case",
        description: "Your starting plan",
        isBase: true,
        color: "#3b82f6",
        tag: "custom" as const,
        clusters: [],
        riskLevel: "medium" as const,
        timeHorizon: "long" as const,
        assumptions: {
          incomeGrowthRate: 0.03,
          inflationRate: 0.03,
          investmentReturnRate: 0.06,
        },
        createdAt: new Date().toISOString(),
      },
    ],
    activeScenarioId: "base",
    transactions: [],
    merchantRules: [],
    statementImports: [],
    customExpenseCategories: [],
    yearlyForecast: [],
    monthlyForecast: [],
  };
}
```

Notes:
- Generic Thai personal/employment deductions (60K / 100K) are kept because they're tax-law constants, not user-specific data — that is fine.
- Only the **Base Case** scenario is kept (Zustand requires at least one scenario for the UI to render). All 25 of Somchai's other scenarios (`income-shock`, `aggressive-paydown`, etc.) are gone for new users; they can add their own.
- If TypeScript complains about a missing import (e.g. `crypto.randomUUID` not in scope), add `import { v4 as uuid } from "uuid";` at the top and use `uuid()` instead.

Verify by running `npx tsc --noEmit` (or whatever the project's typecheck command is — check `package.json` `scripts`).

---

## Step 2 — Boot Zustand with empty data, not seed

**File:** `src/lib/store.ts`

Find the initial state object around lines 154–165. It currently looks like:

```ts
profile: seedProfile,
incomes: seedIncomes,
expenses: seedExpenses,
debts: seedDebts,
investments: seedInvestments,
retirement: seedRetirement,
tax: seedTax,
scenarios: seedScenarios,
// ...
isSeedLoaded: true,
```

Replace those eight lines with values from `getEmptySnapshot()`. Add this import at the top of the file (or extend the existing import from `./users`):

```ts
import { getEmptySnapshot } from "./users";
```

Then change the initial-state block to:

```ts
const _initial = getEmptySnapshot("");
profile: _initial.profile,
incomes: _initial.incomes,
expenses: _initial.expenses,
debts: _initial.debts,
investments: _initial.investments,
retirement: _initial.retirement,
tax: _initial.tax,
scenarios: _initial.scenarios,
activeScenarioId: _initial.activeScenarioId,
isSeedLoaded: false,        // ← was true; set to false now
```

(`const _initial = ...` needs to be hoisted just before the create() call — Zustand's `create((set, get) => ({ ... }))` block — not inside the object literal. Move it to the appropriate spot above the object.)

**Also** — find `loadSeedData` (around line 667). Leave the function intact (still useful for the demo role / "Reload Scenarios" button) but rename it to `loadDemoData` if anything in the UI calls it from a "Reset" button visible to real users — verify by grepping for `loadSeedData(` usages. If you find any user-facing button that calls it, change that button's handler to call `loadEmptyData` (a new sibling function you add that uses `getEmptySnapshot()` instead of seed*). Do **not** silently break existing call sites.

Run `npx tsc --noEmit` after this step.

---

## Step 3 — Stop seeding Somchai in `synthesizeSession()`

**File:** `src/lib/auth.ts`

Find `export function synthesizeSession(appUser: AppUser): Session` (around line 72). The current store-reset block (around lines 80–109) uses `seedMod.seedProfile`, `seedMod.seedIncomes`, etc.

Replace the entire `(async () => { ... })()` IIFE that does the reset with one that uses `getEmptySnapshot()`:

```ts
// 🔐 Reset Zustand to a BLANK snapshot on session synthesis (not Somchai seed).
// The remote GET /api/sync will hydrate any real data the user has saved.
if (isClient) {
  (async () => {
    try {
      const { useStore } = await import("./store");
      const { getEmptySnapshot } = await import("./users");
      const empty = getEmptySnapshot(appUser.username || "");
      useStore.setState({
        profile: empty.profile,
        incomes: empty.incomes,
        expenses: empty.expenses,
        debts: empty.debts,
        investments: empty.investments,
        retirement: empty.retirement,
        tax: empty.tax,
        scenarios: empty.scenarios,
        activeScenarioId: empty.activeScenarioId,
        isSeedLoaded: false,
        transactions: [],
        merchantRules: [],
        statementImports: [],
        customExpenseCategories: [],
        yearlyForecast: [],
        monthlyForecast: [],
        isHydratedFromRemote: false,  // gate the auto-sync POST until GET completes
      }); // merge only — do NOT pass replace=true
      sessionStorage.removeItem("financial-planner-storage-v3");
    } catch { /* non-fatal */ }
  })();
}
```

Important: the `if (isClient && existingSession && existingSession.userId !== appUser.id)` guard from the previous version is **removed**. The reset must happen on every `synthesizeSession` call — including fresh-tab logins where there is no existing session. That is what was missing before.

If `isHydratedFromRemote` does not exist in the store yet, add it. In `src/lib/store.ts`:
- Add to the state interface: `isHydratedFromRemote: boolean;`
- Add to the setter interface: `setHydratedFromRemote: (v: boolean) => void;`
- Add initial value: `isHydratedFromRemote: false,`
- Add setter implementation: `setHydratedFromRemote: (v) => set((s) => { s.isHydratedFromRemote = v; }),`
- Add to `partialize` so it persists in sessionStorage.

The POST gate that uses this flag already exists in `src/lib/users.ts → saveRemoteUserData` (around lines 241–249). Verify it's still there — do not remove it.

After remote hydration succeeds, set `isHydratedFromRemote = true`. Find the post-login code path (search for `loadRemoteUserData` callsites in `src/components/AuthGuard.tsx` and `src/app/login/page.tsx`) and ensure that after a successful 200 OR a 404 ("no data yet for this user"), `useStore.getState().setHydratedFromRemote(true)` is called. On any other error (500, network), leave the flag false so the client never overwrites unread server data with the empty snapshot.

---

## Step 4 — Stop seeding Somchai in `clearSession()`

**File:** `src/lib/auth.ts`

Find `export async function clearSession()` (around line 126). The block that resets the store (around lines 134–157) uses seed*. Replace it with the same empty-snapshot pattern from Step 3:

```ts
try {
  const { useStore } = await import("./store");
  const { getEmptySnapshot } = await import("./users");
  const empty = getEmptySnapshot("");
  useStore.setState({
    profile: empty.profile,
    incomes: empty.incomes,
    expenses: empty.expenses,
    debts: empty.debts,
    investments: empty.investments,
    retirement: empty.retirement,
    tax: empty.tax,
    scenarios: empty.scenarios,
    activeScenarioId: empty.activeScenarioId,
    isSeedLoaded: false,
    transactions: [],
    merchantRules: [],
    statementImports: [],
    customExpenseCategories: [],
    yearlyForecast: [],
    monthlyForecast: [],
    isHydratedFromRemote: false,
  });
  sessionStorage.removeItem("financial-planner-storage-v3");
} catch { /* non-fatal */ }
```

---

## Step 5 — Stop persisting Somchai for newly-created accounts

**File:** `src/app/accounts/page.tsx`

Around lines 52 and 89, find:

```ts
persistUserData(user.storageKey, getDemoSnapshot());
```

and

```ts
persistUserData(newUser.storageKey, getDemoSnapshot());
```

Replace both with:

```ts
persistUserData(user.storageKey, getStartingSnapshot(user.role, user.username || ""));
```

and

```ts
persistUserData(newUser.storageKey, getStartingSnapshot(newUser.role, newUser.username || ""));
```

(`getStartingSnapshot` is already exported from `src/lib/users.ts` and routes `role === "demo"` → demo snapshot, everything else → `getEmptySnapshot`. This is the right primitive — use it instead of hardcoding `getDemoSnapshot()`.)

Update the import line at the top of `src/app/accounts/page.tsx` accordingly: replace `getDemoSnapshot` with `getStartingSnapshot` if `getDemoSnapshot` is no longer referenced anywhere else in that file.

Grep the rest of `src/` for any other `getDemoSnapshot()` callsites and either leave them (if they're truly demo-role only — e.g. an admin "Reset to Demo Data" button) or convert to `getStartingSnapshot(role, displayName)` the same way.

---

## Step 6 — Server cleanup (Supabase)

The user must run these in the Supabase SQL editor — you cannot do this from the codebase. Write the queries below into a file called `WIPE_SOMCHAI_SUPABASE.sql` in the repo root, and tell the user to copy-paste them.

```sql
-- 1. Identify which user_data rows still contain Somchai seed data
SELECT
  storage_key,
  data->'profile'->>'fullName' AS profile_name,
  jsonb_array_length(COALESCE(data->'incomes', '[]'::jsonb)) AS income_count,
  jsonb_array_length(COALESCE(data->'expenses', '[]'::jsonb)) AS expense_count,
  updated_at
FROM user_data
WHERE
  data->'profile'->>'fullName' = 'Somchai'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(data->'incomes', '[]'::jsonb)) inc
    WHERE inc->>'owner' = 'Somchai'
  );

-- 2. Inspect output above. For each polluted row, choose ONE:
--    (A) Delete the row entirely — user will start blank on next login.
--    (B) Restore from a Google Drive backup — open BackupWidget in the app
--        and pick a version dated before the corruption.

-- Option A — delete polluted rows (run only after manual review of step 1):
DELETE FROM user_data
WHERE
  data->'profile'->>'fullName' = 'Somchai'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(data->'incomes', '[]'::jsonb)) inc
    WHERE inc->>'owner' = 'Somchai'
  );

-- 3. Optional — also wipe storage_keys that should never have been seeded:
--    (run only if the user wants a hard reset of all non-admin data)
-- DELETE FROM user_data
-- WHERE storage_key NOT IN (
--   SELECT "storageKey" FROM app_users WHERE role = 'admin'
-- );

-- 4. Sanity check after deletion
SELECT COUNT(*) AS remaining_rows FROM user_data;
SELECT COUNT(*) AS rows_with_somchai
  FROM user_data WHERE data::text ILIKE '%Somchai%';
-- Both queries should return values consistent with what you expect.
-- The second one MUST return 0.
```

---

## Step 7 — Typecheck and commit

Run from the repo root (use the `Bash` tool, not heredocs):

```bash
cd "/Users/stoyreo/Desktop/Claude Migration"
npx tsc --noEmit
```

Fix any TypeScript errors before committing. Then:

```bash
git add src/lib/users.ts src/lib/store.ts src/lib/auth.ts src/app/accounts/page.tsx WIPE_SOMCHAI_SUPABASE.sql
git status        # confirm only the expected files are staged
git diff --staged --stat
git commit -m "fix: replace Somchai seed with empty snapshot on login/logout/signup"
```

Do **not** push. Tell the user the commit is ready and they should `git push origin main` themselves.

---

## Step 8 — Test plan (must be reported back to the user)

The user will run these in incognito windows on the deployed Vercel URL after they push. Write the steps clearly in your final report so they know what to verify:

1. **Brand new account, fresh incognito:**
   - Sign up with a new email.
   - Dashboard greeting must use the new email/username, **not "Somchai"**.
   - Net Worth, Total Debt, Total Investments must all be **฿0**.
   - Income / Expenses / Debts / Investments tables must be empty (zero rows).
   - Scenarios sidebar must show only **Base Case** (no "Aggressive Mortgage Paydown", no "Income Shock", etc.).
2. **Admin re-login, fresh incognito:**
   - Log in as `toy.theeranan@icloud.com`.
   - If admin's row was deleted in Step 6, dashboard shows blank (expected).
   - If admin's row was restored from Drive backup, dashboard shows real data (also expected).
   - In **neither** case should the dashboard say "Somchai".
3. **Cross-user same tab:**
   - Sign out → log in as a different user. Second user must not see any of the first user's data.
4. **Network tab during login:**
   - Confirm `GET /api/sync?storageKey=...` fires before any `POST /api/sync`.
   - If a POST fires first, the `isHydratedFromRemote` gate is wired wrong — re-check Step 3.
5. **Supabase SQL check (post-test):**
   - `SELECT COUNT(*) FROM user_data WHERE data::text ILIKE '%Somchai%';` must return **0**.

---

## What to report back

When done, give a single response with:
- Which files you edited and a one-line summary per file.
- Output of `npx tsc --noEmit` (paste verbatim — must say "no errors found" or equivalent).
- The commit SHA from `git log -1 --oneline`.
- A reminder to the user to (a) run the SQL in `WIPE_SOMCHAI_SUPABASE.sql` against Supabase, then (b) `git push origin main`, then (c) run the Step 8 test plan.

Do not make any other changes beyond what is described in steps 1–7. If you find a bug along the way, mention it in your report but do not fix it in this commit.

=== PROMPT END ===
