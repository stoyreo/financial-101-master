# Sonnet Hand-off — What-If Levers Refactor + Live AI Sensitivity

You are Claude (Sonnet). This is the architectural / UX-heavy half of the work. The mechanical scenario-data and card-layout work is being done in parallel by Haiku — DO NOT touch `src/lib/seed.ts` or `src/app/scenarios/page.tsx`.

## Context

Project: **Financial 101 Master**, root `/Users/stoyreo/Desktop/Claude Migration/`. Next.js 14 + Zustand + Recharts + Tailwind + a pure forecast engine in `src/lib/engine/forecast.ts`. The What-If simulator at `src/components/forecast/WhatIfSimulator.tsx` is already wired to a base-vs-sim forecast pair and renders 7 sliders. We're expanding to ~22 sliders grouped into 3 tabs and adding a live AI sensitivity strip.

Master plan: `/Users/stoyreo/Desktop/Claude Migration/SCENARIO_EXPANSION_PLAN.md` — Parts 3 and 4 are yours. Read it first.

## Hard rules

- **Never** modify `.ts`/`.tsx` via bash heredoc / `sed` / `echo >`. The pre-build check `scripts/check-shell-escapes.mjs` will fail the build if `\!` artifacts appear in output. Use the file editor tools (Write/Edit) only. This is a real, recurring regression — don't ignore it.
- **Don't** touch `src/lib/seed.ts`, `src/lib/types.ts` (except adding the one optional helper field if you genuinely need it), or `src/app/scenarios/page.tsx` — those are Haiku's. Coordinate via PR review if any conflict.
- The forecast engine (`src/lib/engine/forecast.ts`) is pure. Don't change its public signature; only call it from your component / hook.
- Multi-user data isolation rules in `CLAUDE.md` still apply. The What-If feature is read-only against user data — only mutates transient `useState`. Don't add anything that writes to localStorage; if you cache, use sessionStorage with a userId prefix or just `useMemo`.

## Files you will edit

1. `src/components/forecast/WhatIfSimulator.tsx` — significant refactor (3 tabs, 22 levers, live impact UI).
2. `src/lib/engine/ai-scenarios.ts` — add `analyzeLeverSensitivity()` (pure function, no LLM call).
3. **Optionally** `src/components/forecast/LiveAISignal.tsx` if it's the right place to render the AI suggestion strip — read it first to decide.

## Task 1 — Add `analyzeLeverSensitivity()` to `ai-scenarios.ts`

Append at the end of `src/lib/engine/ai-scenarios.ts`:

```ts
import type { ScenarioAssumptions, YearlyForecastRow } from "../types";

export interface LeverSensitivity {
  field: keyof ScenarioAssumptions;
  label: string;
  /** Δ final net worth as a fraction of base final net worth, signed */
  deltaNetWorthPct: number;
  /** Δ payoff year (negative = sooner, positive = later, 0 = no change) */
  deltaPayoffYears: number;
  /** Δ retirement net worth, fraction of base */
  deltaRetirementPct: number;
  direction: "up" | "down";
  rationale: string;
  /** 0–100; high when impact is large AND existing AI modules already flag this lever */
  confidence: number;
}

export interface LeverSensitivityInput {
  current: ScenarioAssumptions;
  forecast: (a: ScenarioAssumptions) => YearlyForecastRow[];
  /** Optional cross-reference signals from existing modules */
  riskFlags?: string[];     // e.g. recommendation titles from analyzeRiskAssessment
  savingsFlags?: string[];  // from analyzeSavingsAndDebt
}

export function analyzeLeverSensitivity(input: LeverSensitivityInput): LeverSensitivity[] {
  // For each lever in LEVER_DEFS, bump current[field] by ±5% (or ±1 unit for ints/years),
  // run forecast, measure Δ in final net worth / retirement net worth / payoff year,
  // return ranked by abs(deltaNetWorthPct) desc.
  // ... implementation...
}
```

`LEVER_DEFS` is a static table mapping each lever field to its `label`, kind (`pct`/`amount`/`year`/`months`), and bump size. Same source of truth as the UI — co-locate or export from a small `src/lib/levers.ts` module if cleanest.

This function is pure — no `fetch`, no LLM. It runs on every slider commit (debounced).

## Task 2 — Refactor `WhatIfSimulator.tsx`

### 2a. Group sliders into 3 tabs

Wrap the existing `Levers` `<Card>` body with a `<Tabs>` (use the existing `Tabs / TabsList / TabsTrigger / TabsContent` from `@/components/ui`, same as the scenarios page uses). Three tabs:

- **Macro & Returns** — `incomeGrowthRate`, `inflationRate`, `expenseInflationOverride`, `investmentReturnRate`, `investmentVolatility`
- **Housing & Debt** — `mortgageExtraMonthlyPayment`, `annualLumpSumPrepayment`, `mortgageRateChange`, `mortgageRateChangeYear`, `refinanceYear`, `refinanceRate`
- **Career & Cashflow** — `annualBonusAmount`, `retirementAge`, `salaryRaiseYear`, `salaryRaiseFactor`, `incomeShockYear`, `incomeShockFactor`, `incomeShockDuration`, `taxReliefInvestmentAmount`, `emergencyFundTargetMonths`, `windfallYear`, `windfallAmount`

Slider ranges / steps (use these literally):

| field | min | max | step | unit | format |
|---|---|---|---|---|---|
| `incomeGrowthRate` | 0 | 0.15 | 0.005 | % | `(v*100).toFixed(1)+"%"` |
| `inflationRate` | 0 | 0.10 | 0.0025 | % | toFixed(2) |
| `expenseInflationOverride` | 0 | 0.15 | 0.0025 | % | toFixed(2) |
| `investmentReturnRate` | 0 | 0.15 | 0.0025 | % | toFixed(2) |
| `investmentVolatility` | 0 | 0.40 | 0.01 | % | toFixed(0) |
| `mortgageExtraMonthlyPayment` | 0 | 50_000 | 1_000 | ฿ | `thb(v)` |
| `annualLumpSumPrepayment` | 0 | 500_000 | 10_000 | ฿ | `thb(v)` |
| `mortgageRateChange` | -0.03 | 0.05 | 0.0025 | % | signed |
| `mortgageRateChangeYear` | now | now+10 | 1 | yr | int |
| `refinanceYear` | now | now+10 | 1 | yr | int |
| `refinanceRate` | 0.02 | 0.10 | 0.0025 | % | toFixed(2) |
| `annualBonusAmount` | 0 | 1_000_000 | 10_000 | ฿ | thb |
| `retirementAge` | 45 | 75 | 1 | yr | int |
| `salaryRaiseYear` | now | now+10 | 1 | yr | int |
| `salaryRaiseFactor` | 1.0 | 2.0 | 0.05 | × | `v.toFixed(2)+"×"` |
| `incomeShockYear` | now | now+10 | 1 | yr | int |
| `incomeShockFactor` | 0 | 1 | 0.05 | factor | toFixed(2) |
| `incomeShockDuration` | 1 | 36 | 1 | mo | int |
| `taxReliefInvestmentAmount` | 0 | 500_000 | 25_000 | ฿ | thb |
| `emergencyFundTargetMonths` | 1 | 18 | 1 | mo | int |
| `windfallYear` | now | now+10 | 1 | yr | int |
| `windfallAmount` | 0 | 5_000_000 | 50_000 | ฿ | thb |

Tab heads should show a small dot (`<span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary" />`) when any lever in that tab differs from base by more than its smallest step.

### 2b. Per-slider live impact bar

Beside each slider's value, render a thin coloured bar — width proportional to `Math.min(1, abs(deltaNetWorthPct)/0.20)` (i.e. saturates at 20% impact), green for positive, red for negative. This makes "which knobs matter" visually obvious. Driven by `analyzeLeverSensitivity()` output, recomputed on `useDeferredValue(sim)` so dragging stays smooth.

### 2c. Active-lever pulsing badge

Track `lastChangedField: keyof ScenarioAssumptions | null` in state, set on every `onChange`. For that field, render a small `<Badge>` next to the slider value reading e.g. `+4.3% NW · payoff −2yr` (use `analyzeLeverSensitivity` output). Add `animate-pulse` while `lastChangedField` is non-null, clear with a 500ms `setTimeout`.

### 2d. AI suggestion strip

Above the tabs, render a horizontal scrollable strip with 3 chip buttons. Each chip = `analyzeLeverSensitivity(...).slice(0, 3)` ranked by `abs(deltaNetWorthPct)`. Format:

```
┌──────────────────────────────────────┐
│ Try +5% return → +฿1.2M (+4.3%)      │
└──────────────────────────────────────┘
```

Clicking a chip applies the suggested bump to `sim` (so the user can preview it). Each chip has a confidence dot (green ≥80, yellow 60–79, red <60). Confidence comes from cross-referencing the existing `analyzeRiskAssessment` / `analyzeSavingsAndDebt` flags — pass their `recommendations[].title` strings into `analyzeLeverSensitivity` as `riskFlags` / `savingsFlags`.

### 2e. Performance

- Wrap forecast calls in `useMemo` keyed off the relevant assumption fields.
- Use `React.useDeferredValue(sim)` to feed the sensitivity computation so slider dragging never blocks.
- The base forecast is computed once per scenario change, not per sim change — already correct in the current code, preserve that.

## Task 3 — Optional polish

If easy: add a "What-If Recipes" overflow menu on the simulator header with 3 quick-apply presets (drives `setSim` to canned values): "Aggressive payoff", "Bear market planning", "Career change buffer". This is bonus — skip if any task above is at risk.

## Verify

```bash
npm run lint
npm run build
```

Manual smoke test (describe in your reply):

1. Open `/forecast`, switch to **What-If Simulator** tab.
2. Confirm three lever tabs render. Switching tabs preserves slider values.
3. Drag `Investment return` slider → live impact bar grows, pulsing badge appears, AI strip recommends a higher-impact lever.
4. Drag `Mortgage rate change` to +3% → mortgage payoff year tile turns red and shifts later.
5. Click an AI suggestion chip → sim updates, badge appears on that field.
6. Click `Save as scenario` → new scenario is saved with all 22 fields preserved.

## Done criteria

- 22 levers across 3 tabs, all wired to forecast.
- Live impact bars visible on every slider; active-lever pulsing badge works.
- AI suggestion strip renders 3 chips ranked by impact, clickable, with confidence dots.
- `analyzeLeverSensitivity()` is exported, pure, type-safe, no LLM call.
- `npm run build` is green; no `\!` artifacts (pre-build check passes).
- You did not touch `src/lib/seed.ts` or `src/app/scenarios/page.tsx`.

Reply when done with: file diff summary + smoke-test result + any architectural decisions you made (e.g., where you put `LEVER_DEFS`, how you debounced).
