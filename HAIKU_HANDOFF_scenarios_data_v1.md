# Haiku Hand-off — Scenario Data + Card Layout Polish

You are Claude (Haiku). This is a scoped, mechanical task. Do NOT redesign the simulator or the AI engine — that work is going to Sonnet in parallel. Stick to the files listed.

## Context

The user (Theeranan) runs **Financial 101 Master** at `/Users/stoyreo/Desktop/Claude Migration/`. It's a Next.js + Zustand + Recharts personal-finance planner. The `/scenarios` page today only ships 5 default scenarios and the cards waste a lot of horizontal space. We're going to (a) seed 20 more scenarios and (b) tighten the card layout.

A master plan lives at `/Users/stoyreo/Desktop/Claude Migration/SCENARIO_EXPANSION_PLAN.md` — Parts 1 and 2 are yours. Parts 3 and 4 are NOT yours.

## Hard rules

- **Never** modify TypeScript via bash heredoc / `sed` / `echo >`. Use direct file editor tools only — `CLAUDE.md` enforces this and there is a pre-build check that will fail.
- **Never** touch `src/components/forecast/WhatIfSimulator.tsx` or `src/lib/engine/ai-scenarios.ts`. That's Sonnet's surface.
- After edits run `npm run build` (or `npm run lint`) to confirm no SWC / type regressions before declaring done.

## Files you will edit

1. `src/lib/seed.ts` — append 20 scenarios to `seedScenarios`.
2. `src/lib/types.ts` — add an optional `tag?: "good" | "bad" | "custom"` field to `Scenario`.
3. `src/app/scenarios/page.tsx` — adjust the All Scenarios grid + card body + add filter strip.

## Task 1 — Append 20 scenarios

Open `src/lib/seed.ts`, locate `export const seedScenarios: Scenario[]`, and append the 20 entries below to the existing array (do NOT remove or reorder the original 5). Use `new Date().toISOString()` for `createdAt`. Pick `color` from this palette by index: `["#3b82f6","#10b981","#ef4444","#8b5cf6","#f59e0b","#06b6d4","#f97316","#ec4899","#14b8a6","#a855f7"]`.

Set `tag: "good"` on items 1–10 and `tag: "bad"` on items 11–20.

Use `now` = current calendar year. In code, write `new Date().getFullYear()` and arithmetic on it.

| # | id | name | description | tag | assumptions |
|---|---|---|---|---|---|
| 1 | `rates-fall-refi` | Falling Rates Refi | Refinance at 4.0% in 2 years as rates ease | good | `incomeGrowthRate: 0.04, inflationRate: 0.025, investmentReturnRate: 0.07, mortgageExtraMonthlyPayment: 5_000, refinanceYear: now+2, refinanceRate: 0.04` |
| 2 | `bull-decade` | Bull Market Decade | Sustained 10% portfolio returns | good | `incomeGrowthRate: 0.05, inflationRate: 0.025, investmentReturnRate: 0.10` |
| 3 | `tame-inflation` | Inflation Tamed | CPI back to 1.5% | good | `inflationRate: 0.015, expenseInflationOverride: 0.015, investmentReturnRate: 0.075, incomeGrowthRate: 0.04` |
| 4 | `mega-bonus` | Mega Bonus Year | One-off ฿500K bonus, 200K to mortgage | good | `annualBonusAmount: 500_000, annualLumpSumPrepayment: 200_000, investmentReturnRate: 0.07` |
| 5 | `career-surge` | Career Surge | +20% pay bump in year 3 | good | `salaryRaiseYear: now+3, salaryRaiseFactor: 1.20, incomeGrowthRate: 0.05, investmentReturnRate: 0.07` |
| 6 | `inheritance` | Inheritance Windfall | ฿1M lump in year 5 | good | `windfallYear: now+5, windfallAmount: 1_000_000, annualLumpSumPrepayment: 100_000, investmentReturnRate: 0.07` |
| 7 | `tax-reform-rmf` | Tax Reform Win | Max RMF/SSF every year | good | `taxReliefInvestmentAmount: 500_000, investmentReturnRate: 0.075, incomeGrowthRate: 0.04` |
| 8 | `mortgage-free-5y` | Mortgage Free in 5 | Aggressive ฿50K/mo extra | good | `mortgageExtraMonthlyPayment: 50_000, annualLumpSumPrepayment: 100_000, investmentReturnRate: 0.06` |
| 9 | `fire-50` | FIRE at 50 | Cut expenses, max contribs, retire early | good | `retirementAge: 50, expenseInflationOverride: 0.02, taxReliefInvestmentAmount: 500_000, investmentReturnRate: 0.08` |
| 10 | `dual-income` | Dual-Income Household | Spouse income year 2 | good | `salaryRaiseYear: now+2, salaryRaiseFactor: 1.40, mortgageExtraMonthlyPayment: 15_000, investmentReturnRate: 0.07` |
| 11 | `stagflation` | Stagflation | 7% inflation, 3% returns | bad | `inflationRate: 0.07, expenseInflationOverride: 0.07, investmentReturnRate: 0.03, incomeGrowthRate: 0.02` |
| 12 | `rate-hike-shock` | Rate Hike Shock | Mortgage rate +3% next year | bad | `mortgageRateChange: 0.03, mortgageRateChangeYear: now+1, mortgageExtraMonthlyPayment: 0, investmentReturnRate: 0.05` |
| 13 | `recession-30` | Recession | -30% income for 24 months | bad | `incomeShockYear: now+2, incomeShockFactor: 0.7, incomeShockDuration: 24, investmentReturnRate: 0.04` |
| 14 | `bear-5y` | 5-Year Bear Market | 2% returns for 5 years | bad | `investmentReturnRate: 0.02, investmentVolatility: 0.20, inflationRate: 0.035` |
| 15 | `health-shock` | Health Emergency | ฿500K out-of-pocket year 2 | bad | `oneTimeExpenses: [{ year: now+2, amount: 500_000, description: "Medical" }], investmentReturnRate: 0.06` |
| 16 | `job-loss-6mo` | Job Loss | 6-month full income loss next year | bad | `incomeShockYear: now+1, incomeShockFactor: 0, incomeShockDuration: 6, investmentReturnRate: 0.05` |
| 17 | `housing-bust` | Housing Bust | Refi delayed, rate +2% | bad | `mortgageRateChange: 0.02, mortgageRateChangeYear: now+1, refinanceYear: now+5, investmentReturnRate: 0.04` |
| 18 | `layoff-restart` | Layoff & Restart | -40% 18 months, then recover | bad | `incomeShockYear: now+1, incomeShockFactor: 0.6, incomeShockDuration: 18, salaryRaiseYear: now+3, salaryRaiseFactor: 1.10, investmentReturnRate: 0.05` |
| 19 | `hyperinflation` | Hyperinflation | 10% CPI, real wages -3% | bad | `inflationRate: 0.10, expenseInflationOverride: 0.10, incomeGrowthRate: 0.07, investmentReturnRate: 0.04` |
| 20 | `late-retire-70` | Late Retirement at 70 | Push retirement out | bad | `retirementAge: 70, investmentReturnRate: 0.045, inflationRate: 0.04, incomeGrowthRate: 0.03` |

## Task 2 — Add `tag` to `Scenario`

In `src/lib/types.ts`, find `export interface Scenario` and add:

```ts
tag?: "good" | "bad" | "custom";
```

The original 5 seeded scenarios have no `tag` (treat them as untagged → render under "All" only). Update them only if trivial — otherwise leave alone; the filter logic below tolerates undefined.

## Task 3 — Card layout polish (`src/app/scenarios/page.tsx`)

In the `All Scenarios` `<TabsContent value="overview">`:

1. Above the grid, render a filter strip:
   - left: `<Input>` search (filters by name and description, case-insensitive)
   - right: a 4-button segmented control `[All | Good | Bad | Custom]` (use existing `Button` with `variant={selected ? "default" : "outline"}`)
   - track `filter` and `query` in `useState`.
   - "Custom" matches any scenario whose `id` is not in the seed list (i.e. `!seedScenarios.find(seed => seed.id === s.id)`) OR `tag === "custom"`. Import `seedScenarios` from `@/lib/seed`.
2. Change grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3`.
3. Card body density: `p-3` instead of `p-4`. Title `text-sm`, description `text-[11px]` and `line-clamp-2`.
4. Replace the single full-width `Activate` `Button` with a flex row of 4 buttons:
   - `Activate` / `Active` (size sm, ghost/default depending on isActive, takes ~60% of row width)
   - `<Edit size=12 />` (icon-only ghost button → calls existing `openEdit(s)`)
   - `<Copy size=12 />` (icon-only ghost button → duplicates: calls `addScenario({ ...s, name: s.name + " (copy)", isBase: false })`)
   - `<Trash2 size=12 />` (icon-only ghost button, only renders when `!s.isBase` → calls existing `handleDelete(s.id)`)

   Use `lucide-react` for `Copy`. The other icons are already imported.
5. Sort: `seedScenarios` order first, then user-created (those with id not in seed) at the end. Within tag groups, base first then good then bad.

## Verify

```bash
npm run lint     # must pass
npm run build    # must pass — pre-build check enforces "no \! shell artifacts"
```

Smoke-test by mentally walking through the page: filter strip works, grid shows 4–5 columns, each card has icon row, deleting non-base works, base case is undeletable.

## Done criteria

- 25 scenarios visible at `/scenarios` (5 originals + 20 new).
- Filter strip filters correctly by tag and search query.
- Card grid is denser (4–5 cols on desktop) with compact action row.
- `npm run build` is green.
- You did not touch `WhatIfSimulator.tsx` or `ai-scenarios.ts`.

Reply when done with: list of files changed + any issues encountered.
