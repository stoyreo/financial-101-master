# Scenario Planner & What-If Expansion — Master Plan

**Date:** 2026-05-10
**Owner:** Theeranan
**Files this plan touches:**

- `src/lib/seed.ts` — add 20 new default scenarios
- `src/lib/types.ts` — extend `ScenarioAssumptions` (only if any new lever fields don't exist yet — most already do)
- `src/app/scenarios/page.tsx` — tighten card grid, button polish, responsive density
- `src/components/forecast/WhatIfSimulator.tsx` — refactor lever panel into 3 grouped tabs, add 10+ levers, wire AI live-impact strip
- `src/components/forecast/LiveAISignal.tsx` (existing) — extend to drive lever recommendations
- `src/lib/engine/ai-scenarios.ts` — add a small `analyzeLeverSensitivity()` helper

Architecture is already friendly to all of this — the forecast engine is pure, `ScenarioAssumptions` already has most fields, and the simulator already has a base-vs-sim forecast pair. We're mostly extending UI surface and adding data.

---

## Part 1 — 20 New Default Scenarios (10 Good, 10 Bad)

Each scenario uses fields that already exist in `ScenarioAssumptions`. No type changes needed for the seed list.

### A. Optimistic / "good" scenarios (10)

| # | id | name | description | key assumptions |
|---|---|---|---|---|
| 1 | `rates-fall-refi` | Falling Rates Refi | Refinance at 4.0% in 2 years as central banks cut | `refinanceYear: now+2, refinanceRate: 0.04, mortgageExtraMonthlyPayment: 5_000` |
| 2 | `bull-decade` | Bull Market Decade | Sustained 10% portfolio returns for the next decade | `investmentReturnRate: 0.10, inflationRate: 0.025, incomeGrowthRate: 0.05` |
| 3 | `tame-inflation` | Inflation Tamed | CPI back to 1.5%, real returns expand | `inflationRate: 0.015, expenseInflationOverride: 0.015, investmentReturnRate: 0.075` |
| 4 | `mega-bonus` | Mega Bonus Year | One-off ฿500K performance bonus | `annualBonusAmount: 500_000, annualLumpSumPrepayment: 200_000` |
| 5 | `career-surge` | Career Surge | +20% pay bump in year 3 (promotion / new role) | `salaryRaiseYear: now+3, salaryRaiseFactor: 1.20, incomeGrowthRate: 0.05` |
| 6 | `inheritance` | Inheritance Windfall | ฿1M lump in year 5, 50% to mortgage | `windfallYear: now+5, windfallAmount: 1_000_000, annualLumpSumPrepayment: 100_000` |
| 7 | `tax-reform-rmf` | Tax Reform Win | Max RMF/SSF every year, ~฿50K/yr tax saved | `taxReliefInvestmentAmount: 500_000, investmentReturnRate: 0.075` |
| 8 | `mortgage-free-5y` | Mortgage Free in 5 | Aggressive ฿50K/mo extra principal | `mortgageExtraMonthlyPayment: 50_000, annualLumpSumPrepayment: 100_000` |
| 9 | `fire-50` | FIRE at 50 | Cut expenses 20%, max contributions, retire early | `retirementAge: 50, expenseInflationOverride: 0.02, taxReliefInvestmentAmount: 500_000` |
| 10 | `dual-income` | Dual-Income Household | Spouse income kicks in (salary raise factor 1.40 yr 2) | `salaryRaiseYear: now+2, salaryRaiseFactor: 1.40, mortgageExtraMonthlyPayment: 15_000` |

### B. Adverse / "bad" scenarios (10)

| # | id | name | description | key assumptions |
|---|---|---|---|---|
| 11 | `stagflation` | Stagflation | 7% inflation, 3% returns, slow wage growth | `inflationRate: 0.07, expenseInflationOverride: 0.07, investmentReturnRate: 0.03, incomeGrowthRate: 0.02` |
| 12 | `rate-hike-shock` | Rate Hike Shock | Mortgage rate jumps +3% next year, no refi | `mortgageRateChange: 0.03, mortgageRateChangeYear: now+1, mortgageExtraMonthlyPayment: 0` |
| 13 | `recession-30` | Recession | -30% income for 24 months from year 2 | `incomeShockYear: now+2, incomeShockFactor: 0.7, incomeShockDuration: 24` |
| 14 | `bear-5y` | 5-Year Bear Market | 2% portfolio returns for 5 years | `investmentReturnRate: 0.02, investmentVolatility: 0.20` |
| 15 | `health-shock` | Health Emergency | ฿500K out-of-pocket expense year 2 | `oneTimeExpenses: [{ year: now+2, amount: 500_000, description: "Medical" }]` |
| 16 | `job-loss-6mo` | Job Loss | 6-month full income loss next year | `incomeShockYear: now+1, incomeShockFactor: 0, incomeShockDuration: 6` |
| 17 | `housing-bust` | Housing Bust | Property value -20%, refi delayed | `mortgageRateChange: 0.02, mortgageRateChangeYear: now+1, refinanceYear: now+5` |
| 18 | `layoff-restart` | Layoff & Restart | -40% income 18 months, then recover | `incomeShockYear: now+1, incomeShockFactor: 0.6, incomeShockDuration: 18, salaryRaiseYear: now+3, salaryRaiseFactor: 1.10` |
| 19 | `hyperinflation` | Hyperinflation | 10% CPI, real wages -3% | `inflationRate: 0.10, expenseInflationOverride: 0.10, incomeGrowthRate: 0.07, investmentReturnRate: 0.04` |
| 20 | `late-retire-70` | Late Retirement at 70 | Returns short of plan, push retirement out | `retirementAge: 70, investmentReturnRate: 0.045, inflationRate: 0.04` |

Each carries a randomized color from the existing `SCENARIO_COLORS` palette, plus `isBase: false` and `createdAt: new Date().toISOString()`.

---

## Part 2 — Page Layout / Button Optimization

Current pain points (from screenshot):
- Cards span full row width — only 3 across at desktop, 2 across at tablet, lots of dead space below.
- Single full-width "Activate" button per card wastes horizontal real estate.
- "All Scenarios" tab has no filter / search — 25 scenarios will be unmanageable.

Changes:

1. **Tighter card grid.** Bump to `lg:grid-cols-4 xl:grid-cols-5` and reduce padding to `p-3`. Title `text-sm`, description clamps at 2 lines (already does).
2. **Compact button row.** Replace single full-width Activate with: small `Activate` (ghost when active → "Active" pill) + icon-only `Edit` (pencil) + icon-only `Duplicate` (copy) + icon-only `Delete` (only for non-base). Right-aligned.
3. **Filter strip.** Above the grid: search input + segmented filter `[All | Good | Bad | Custom]` driven by a `tag` field (add to `Scenario` type, optional). Defaults sort: base first → good → bad → custom.
4. **Quick-compare toggle.** Multi-select checkbox in card top-right; selected count badge near tab header opens compare tab pre-filled.
5. **Sticky `+ New Scenario` button** stays as-is (top-right of header).

Visual fingerprint stays identical — same cards, same colors, just denser and more useful.

---

## Part 3 — 10+ New Levers, Grouped Into 3 Tabs

The existing simulator has 7 levers in one column. We expand to ~20 levers split across 3 tabs inside the existing left panel. The right panel (charts + delta tiles) stays unchanged.

### Group A — Macro & Returns (5 levers)
| Lever | field | range | step |
|---|---|---|---|
| Income growth | `incomeGrowthRate` | 0–15% | 0.5 |
| Expense inflation | `inflationRate` | 0–10% | 0.25 |
| Override category inflation | `expenseInflationOverride` | 0–15% | 0.25 |
| Investment return | `investmentReturnRate` | 0–15% | 0.25 |
| Investment volatility | `investmentVolatility` | 0–40% | 1 |

### Group B — Housing & Debt (6 levers)
| Lever | field | range | step |
|---|---|---|---|
| Extra monthly payment | `mortgageExtraMonthlyPayment` | 0–50K | 1K |
| Annual lump-sum prepay | `annualLumpSumPrepayment` | 0–500K | 10K |
| Mortgage rate Δ | `mortgageRateChange` | -3% to +5% | 0.25 |
| Rate-change year | `mortgageRateChangeYear` | now to now+10 | 1 |
| Refinance year | `refinanceYear` | now to now+10 | 1 |
| Refinance rate | `refinanceRate` | 2–10% | 0.25 |

### Group C — Career & Cashflow (8 levers)
| Lever | field | range | step |
|---|---|---|---|
| Annual bonus | `annualBonusAmount` | 0–1M | 10K |
| Retirement age | `retirementAge` | 45–75 | 1 |
| Salary raise year | `salaryRaiseYear` | now to now+10 | 1 |
| Salary raise factor | `salaryRaiseFactor` | 1.0–2.0 | 0.05 |
| Income shock year | `incomeShockYear` | now to now+10 | 1 |
| Income shock factor | `incomeShockFactor` | 0–1 | 0.05 |
| Income shock duration | `incomeShockDuration` | 1–36 mo | 1 |
| Tax-relief contribution | `taxReliefInvestmentAmount` | 0–500K | 25K |
| Emergency fund target | `emergencyFundTargetMonths` | 1–18 mo | 1 |
| Windfall year | `windfallYear` | now to now+10 | 1 |
| Windfall amount | `windfallAmount` | 0–5M | 50K |

(Yes that's actually 11 in Group C — totals ~22 levers across the three tabs.)

UI: re-use existing `Tabs` component from `@/components/ui` inside the Levers `<Card>`. Each tab body is a vertical stack of `SliderRow` (already implemented). The tab heading shows a tiny dot if any lever in that tab differs from base — quick visual cue.

---

## Part 4 — AI-Driven Live Lever Sensing (the "% LIVE" feature)

Goal: as the user drags any slider, every visible slider shows in real time how strongly **that** lever is moving the outcomes — and the AI surfaces which lever to try next.

### Mechanics

1. **Sensitivity probe.** For every lever, on each slider commit, compute a small ±5% bump forecast against the current sim. The Δ in final net worth ÷ baseline net worth gives a per-lever **impact %**. Render as a thin coloured bar to the right of the slider value.
2. **Live impact badge.** For the *active* lever (the one being dragged), render a pulsing badge: `+4.3% net worth, payoff 2 yrs sooner` updated on every slider event (debounced 50ms via `useDeferredValue`).
3. **AI suggestions strip.** A horizontal strip above the lever tabs shows 2–3 chips, e.g. `Try +5% return — +฿1.2M`, `Try retire 62 — debt-free 3 yrs sooner`. Chips are generated from `analyzeLeverSensitivity()` (new function — see below) which ranks levers by absolute impact at the user's current sim point.
4. **Confidence dot.** Each AI chip shows a confidence dot derived from existing `analyzeRiskAssessment` / `analyzeSavingsAndDebt` modules — when those modules already flag the same lever (e.g., "Build Emergency Fund"), confidence is 90%; when only sensitivity-derived, 60%.

### New helper

```ts
// src/lib/engine/ai-scenarios.ts
export function analyzeLeverSensitivity(input: {
  base: ScenarioAssumptions;
  current: ScenarioAssumptions;
  forecast: (a: ScenarioAssumptions) => YearlyForecastRow[];
}): Array<{
  field: keyof ScenarioAssumptions;
  label: string;
  deltaNetWorthPct: number;   // % change vs current sim
  deltaPayoffYears: number;
  direction: "up" | "down";
  rationale: string;          // short, e.g. "Compounding boost from +5% return"
}>;
```

This is pure TS, no LLM call needed at runtime — fast, deterministic, and zero infra cost. The "AI" framing is fine because it's interpreting model output for the user.

### Optional Sonnet-served upgrade

If you want true generative narrative (`"Pushing return from 7% to 9% gets you to FI 4 years earlier — but only if volatility stays under 18% sigma"`), wire a /api/ai/lever-narrative endpoint that calls Sonnet/Haiku with the deltas. Strictly optional; the deterministic version ships first.

---

## Part 5 — Sequenced Delivery & Subagent Hand-off

Two hand-off documents exist alongside this plan:

- `HAIKU_HANDOFF_scenarios_data_v1.md` — scoped, mechanical work for Haiku. Pure data and styling. Estimated ~30 minutes of model time.
- `SONNET_HANDOFF_levers_ai_integration_v1.md` — architectural / UX work for Sonnet. Touches engine, types, complex React. Estimated ~2–3 hours of model time.

**Suggested sequence (parallelizable):**

1. **Haiku (parallel)** — adds 20 scenarios, polishes scenario card layout, adds filter strip + new card buttons, re-tests build. Risk: low.
2. **Sonnet (parallel)** — refactors `WhatIfSimulator.tsx` into 3-tab grouped panel, adds the 11 new levers, builds `analyzeLeverSensitivity()`, wires live-impact bars + AI suggestion chips. Risk: medium.
3. **You merge** — review both PRs, smoke-test `/scenarios` and `/forecast`, ship.

Both subagent prompts include the `CLAUDE.md` rule about never editing TS via shell heredoc / sed (avoids the SWC `\!` regression).

---

## Acceptance Checklist

- [ ] `/scenarios` page shows 25 cards (5 original + 20 new), 4–5 per row at desktop.
- [ ] Filter strip (`All | Good | Bad | Custom`) and search work.
- [ ] Each card has compact action row (Activate / Edit / Duplicate / Delete).
- [ ] `WhatIfSimulator` left panel has 3 tabs: Macro & Returns / Housing & Debt / Career & Cashflow.
- [ ] All 22 levers render and mutate the sim forecast.
- [ ] Each slider shows live impact bar; active lever shows pulsing badge.
- [ ] AI suggestion strip renders 2–3 ranked chips above the levers.
- [ ] No SWC errors. Multi-user data isolation rules in `CLAUDE.md` still satisfied (this whole feature is read-only re. user data — only mutates transient sim state).
