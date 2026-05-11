# Investments Page — AI Levers + Live What-If Simulator
**Target page:** `https://financial101.vercel.app/investments`
**File:** `src/app/investments/page.tsx`
**Goal:** Add per-account return % sliders, scenario presets, and a live side-by-side visual diff so the user can *feel* how each return assumption reshapes the 20-year portfolio.

---

## 1. Proposed AI-Integrated Levers

| # | Lever | Type | Why it matters | Model |
|---|-------|------|----------------|-------|
| 1 | **Per-account return % slider** (−5% … +20%) | Live numeric | Core "what if KBank RMF returns 4 not 7%" question | none (pure math, instant) |
| 2 | **Per-account contribution slider** (0 … 3× current) | Live numeric | Tests "what if I doubled PVD top-up" | none |
| 3 | **Time-horizon slider** (5/10/20/30/40 yr) | Live numeric | Reframes the same data on different lenses | none |
| 4 | **Scenario presets:** Base / Bull / Bear / Recession / Custom | One-click | Instantly shifts ALL return %s by a vector | Sonnet generates the vectors from market context |
| 5 | **Inflation toggle** (real vs nominal, default 3%) | Toggle | Shows purchasing-power view | none |
| 6 | **Tax-drag toggle** (15% on non-tax-advantaged growth) | Toggle | Shows after-tax reality | none |
| 7 | **Reallocation lever** — drag % from account A → B | Live | Visual portfolio reshuffling | none |
| 8 | **AI Coach (deep analysis)** — "Analyze this scenario" button | On-demand | 3-paragraph strategic read of the current scenario vs base | **Sonnet 4.6** |
| 9 | **AI Quick Insight (streaming)** — auto-runs on slider release | Real-time | One-line plain-English commentary as user moves sliders | **Haiku 4.5** |
| 10 | **Save & compare snapshots** | Persistence | Pin "Aggressive 2026" vs "Defensive 2026" side-by-side | none |
| 11 | **Goal-seek lever** — "What return do I need to hit ฿X by 2050?" | Solver | Reverses the math: target → required return | Sonnet (explains feasibility) |
| 12 | **Monte Carlo toggle** — 500 randomized return paths around assumptions | Live | Shows P10/P50/P90 cone instead of a single line | none (client math) |

---

## 2. Live Visualizations to Add

All charts already use `recharts` — keep that.

1. **Scenario Diff Bar Chart** — twin stacked bars per year: left = Base, right = Scenario. Color delta-positive bars green, delta-negative red.
2. **Multi-Scenario Line Overlay** — one line per saved snapshot (Base, Bull, Bear, Custom-1, Custom-2). User can hide/show via legend.
3. **Per-Account Delta Cards** — small stat cards above the chart: "KBank RMF: ฿1.2M → ฿2.1M (+75%)" updating live.
4. **Monte Carlo Cone** — shaded P10–P90 area with median line.
5. **Goal Timeline Shift** — "Hits ฿15M target in 2041 (Base) vs 2037 (Scenario)" badge.

---

## 3. Component Architecture

```
src/app/investments/
  page.tsx                          # existing — add <ScenarioSimulator/> below current charts
  _components/
    ScenarioSimulator.tsx           # NEW — main orchestrator, owns scenario state
    LeverPanel.tsx                  # NEW — sliders for return %, contrib, horizon, presets
    ScenarioDiffChart.tsx           # NEW — twin stacked bars
    MultiScenarioLine.tsx           # NEW — overlay of saved snapshots
    MonteCarloCone.tsx              # NEW — P10/P50/P90 area chart
    AIInsightStrip.tsx              # NEW — streaming Haiku one-liner
    AICoachPanel.tsx                # NEW — Sonnet deep-analysis modal/drawer
    snapshots.ts                    # NEW — save/load scenarios from sessionStorage (per-user!)
src/lib/engine/
  projection.ts                     # NEW — pure functions: projectAccount(), projectPortfolio(), monteCarlo()
src/app/api/investments/
  scenario-analysis/route.ts        # NEW — Sonnet endpoint, returns 3-paragraph analysis
  quick-insight/route.ts            # NEW — Haiku endpoint, returns 1-line insight (streaming)
  preset-vectors/route.ts           # NEW — Sonnet generates Bull/Bear vectors from current macro context
```

### State shape (component-local, NOT in Zustand)

```ts
type ScenarioOverride = {
  accountId: string;
  returnPctOverride?: number;       // e.g. 0.05 for 5%
  monthlyContribOverride?: number;  // THB
  allocationDeltaPct?: number;      // -1.0 … +1.0, fraction of portfolio reshuffled
};

type Scenario = {
  id: string;
  name: string;                     // "Bull 2026", "My Custom"
  horizonYears: number;             // 5–40
  inflationPct: number;             // 0.03 default
  applyTaxDrag: boolean;
  taxDragPct: number;               // 0.15 default
  monteCarloEnabled: boolean;
  monteCarloVolPct: number;         // 0.15 default
  overrides: ScenarioOverride[];
  createdAt: string;
};
```

### Persistence
- Snapshots saved to **`sessionStorage`** keyed by `userId` (per CLAUDE.md isolation rules).
- Key: `f101:investments:scenarios:${userId}`.
- Never localStorage — that bit you in May 2026.

---

## 4. API Endpoints

### A. `POST /api/investments/quick-insight` — **Haiku 4.5** (low-latency, ≤300ms goal)

Triggered on slider-release (debounced 400ms). Returns ONE plain-English sentence.

**Request body:**
```json
{
  "horizonYears": 20,
  "basePortfolioFinalValue": 12500000,
  "scenarioPortfolioFinalValue": 18200000,
  "deltaByAccount": [
    { "name": "KBank RMF", "baseEnd": 4200000, "scenarioEnd": 6100000, "returnDelta": 0.03 },
    { "name": "SCB SSF",   "baseEnd": 1900000, "scenarioEnd": 2400000, "returnDelta": 0.01 }
  ],
  "presetName": "Custom"
}
```

**Response:**
```json
{ "insight": "Lifting KBank RMF from 7% to 10% adds ฿1.9M over 20 years — your biggest swing factor by far." }
```

**System prompt:**
```
You are a Thai personal-finance coach. Given a what-if scenario diff, return ONE
sentence (max 25 words) explaining the most surprising or actionable insight.
Be specific with numbers. No preamble. No JSON wrapper. Just the sentence.
Use ฿ for THB. Mention the largest single driver of the change.
```

**Model:** `claude-haiku-4-5-20251001`, `max_tokens: 80`, `stream: true`.

---

### B. `POST /api/investments/scenario-analysis` — **Sonnet 4.6** (depth, ~3–6s)

Triggered when user clicks "Analyze this scenario". Returns a 3-section structured analysis.

**Request body:** full `Scenario` object + base + scenario projection arrays + user profile (age, retirement target year).

**Response shape:**
```json
{
  "verdict": "moderately aggressive",
  "headline": "Doable but concentrated in equity risk",
  "analysis": "string (3 paragraphs, markdown)",
  "risks": ["...", "..."],
  "opportunities": ["...", "..."],
  "actionPlan": [
    { "step": "...", "horizon": "this month", "effortHours": 2 }
  ],
  "confidenceScore": 0.72
}
```

**System prompt (key parts):**
```
You are a CFP-level Thai investment advisor analyzing a what-if scenario.
Given the user's BASE projection and the SCENARIO projection, produce:
- A 1-line VERDICT (conservative | balanced | moderately aggressive | aggressive | unrealistic)
- A HEADLINE (≤12 words) capturing the trade-off
- 3 paragraphs of ANALYSIS: (1) what changes, (2) why it might/might not be realistic
  given Thai market history (SET TR ~6–8% long-run, RMF/SSF tax shield, etc.),
  (3) what it means for the retirement goal
- 2–4 specific RISKS (sequence-of-returns, concentration, currency, etc.)
- 2–4 OPPORTUNITIES (tax-shielded room, contribution headroom, rebalancing windows)
- 3–5 ACTION PLAN steps with horizon and effort
- A confidenceScore 0–1 reflecting how realistic the assumptions are

Return STRICT JSON matching the schema. No prose outside JSON. No fences.
```

**Model:** `claude-sonnet-4-6`, `max_tokens: 2500`.

---

### C. `POST /api/investments/preset-vectors` — **Sonnet 4.6** (cached 24h)

Generates the Bull/Bear/Recession return-shift vectors from current macro context. Cache the result per day so this isn't called on every page load.

**Response:**
```json
{
  "asOf": "2026-05-10",
  "presets": {
    "bull":      { "label": "Bull",      "shifts": { "PVD": 0.03, "RMF": 0.04, "brokerage": 0.05, "savings": 0.005, "crypto": 0.20, "other": 0.02 } },
    "bear":      { "label": "Bear",      "shifts": { "PVD": -0.02, "RMF": -0.03, "brokerage": -0.05, "savings": 0.0, "crypto": -0.40, "other": -0.02 } },
    "recession": { "label": "Recession", "shifts": { "PVD": -0.04, "RMF": -0.06, "brokerage": -0.10, "savings": -0.005, "crypto": -0.55, "other": -0.05 } }
  },
  "rationale": "string (1 paragraph, why these numbers given current Thai/global context)"
}
```

---

## 5. Pure Math (no AI needed) — `src/lib/engine/projection.ts`

```ts
export type AccountInput = {
  id: string;
  name: string;
  marketValue: number;
  monthlyContribution: number;
  annualContribution: number;
  expectedAnnualReturn: number;     // 0.07 = 7%
  isTaxAdvantaged: boolean;
};

export function projectAccount(
  acc: AccountInput,
  years: number,
  opts: { inflationPct?: number; taxDragPct?: number; applyTaxDrag?: boolean } = {}
): number[] {
  const r = acc.expectedAnnualReturn
    - (opts.applyTaxDrag && !acc.isTaxAdvantaged ? (opts.taxDragPct ?? 0.15) * acc.expectedAnnualReturn : 0)
    - (opts.inflationPct ?? 0);
  const contrib = acc.monthlyContribution * 12 + acc.annualContribution;
  return Array.from({ length: years + 1 }, (_, yr) => {
    const fv = acc.marketValue * Math.pow(1 + r, yr)
      + (r !== 0 ? contrib * (Math.pow(1 + r, yr) - 1) / r : contrib * yr);
    return Math.round(fv);
  });
}

export function projectPortfolio(accounts: AccountInput[], years: number, opts = {}) {
  return accounts.map(a => ({ accountId: a.id, name: a.name, series: projectAccount(a, years, opts) }));
}

export function monteCarlo(
  accounts: AccountInput[],
  years: number,
  runs = 500,
  volPct = 0.15,
): { p10: number[]; p50: number[]; p90: number[] } {
  // Per-year sampled returns ~ Normal(meanR, volPct). Aggregate across accounts.
  // Returns three series of length `years+1`.
  // Implementation note: use Box-Muller for normal sampling, no extra deps.
  // (Sonnet: write the full body — keep it under 60 lines, deterministic by seeded RNG if `seed` opt is passed.)
}
```

---

## 6. Paste-Ready Implementation Prompts

### → For **Sonnet** (architecture + UI build)

> You are implementing the AI Investments Simulator described in
> `/Users/stoyreo/Desktop/Claude Migration/INVESTMENTS_AI_SIMULATOR_SPEC.md`.
>
> Build everything in section 3 (Component Architecture) and section 5 (projection.ts).
> Wire `<ScenarioSimulator/>` into `src/app/investments/page.tsx` BELOW the existing
> "20-Year Growth Projection" card. Do not break the existing page.
>
> Constraints:
> - Use only the libraries already present (`recharts`, `lucide-react`, the local `@/components/ui` kit, Zustand store).
> - No new npm dependencies.
> - Follow CLAUDE.md isolation rules: snapshots go to `sessionStorage` keyed by `userId`, NEVER `localStorage`.
> - All TS edits via the file editor tool — never via shell heredoc (see CLAUDE.md "Editing TypeScript source").
> - Sliders must update the chart at 60fps (no API calls). Quick-insight API only fires on slider-release, debounced 400ms.
> - Scenario diff chart must visually highlight delta (green up, red down).
> - "Save snapshot" pins a copy; "Compare" lets the user overlay up to 4.
> - Add a "Reset to base" button.
> - Mobile: stack the panels; sliders must be touch-friendly (≥40px hit target).
>
> Acceptance: I open `/investments`, scroll past current charts, see the simulator,
> drag the KBank RMF return slider from 7→10%, the chart redraws live, and ~400ms
> after I release I see a Haiku one-liner like "Lifting KBank RMF to 10% adds ฿1.9M…".
> Clicking "Analyze this scenario" opens a drawer with Sonnet's 3-paragraph read.
>
> Build the API routes too — both `/api/investments/quick-insight` and
> `/api/investments/scenario-analysis`. Reuse the error-handling pattern from
> `src/app/api/expenses/suggest-cuts/route.ts` (credits/auth/rate-limit branches).

### → For **Haiku** (commentary endpoint only, if you want to split work)

> Implement `src/app/api/investments/quick-insight/route.ts` per section 4-A of
> `INVESTMENTS_AI_SIMULATOR_SPEC.md`. Stream the response. Use
> `claude-haiku-4-5-20251001`. Mirror the error-branching structure from
> `src/app/api/expenses/suggest-cuts/route.ts`. Return plain text (not JSON) — the
> client will display the streamed sentence directly. p95 latency target: 800ms.

---

## 7. Acceptance Criteria (manual QA on financial101.vercel.app)

1. Sliders move charts in real time (<16ms per frame).
2. Quick-insight one-liner appears within ~1s of slider release.
3. "Analyze scenario" returns Sonnet analysis within 8s, structured into Verdict/Headline/Analysis/Risks/Opportunities/Actions.
4. Saved snapshots survive page reload (same tab) but NOT logout (sessionStorage).
5. Switching accounts (Toy → Patipat) shows zero of the other user's snapshots.
6. Bull/Bear/Recession presets shift all return %s by the documented vectors.
7. Inflation toggle visibly compresses the projection.
8. Tax-drag toggle reduces brokerage/crypto returns by 15%, leaves PVD/RMF/SSF untouched.
9. Monte Carlo cone renders P10/P50/P90 in <500ms for 500 runs.
10. No new console errors. `npm run build` passes. No `\!` shell-escape artifacts (CLAUDE.md prebuild check).

---

## 8. Cost Notes

- **Haiku quick-insight:** ~300 input + 60 output tokens per slider release. Even at 50 releases/session this is ≈$0.001/session. Safe.
- **Sonnet scenario-analysis:** ~1500 input + 1500 output tokens per click. ≈$0.03/click. Gate behind explicit button (which the spec already does).
- **Sonnet preset-vectors:** Cache for 24h per user. ≈$0.01/day max.

---

## 9. Out of Scope (deliberately)

- Pulling live market data (SET, S&P, gold). Could be Phase 2 — would need a market-data MCP or scraper.
- Per-account historical tracking (we only have current marketValue). Phase 2.
- Multi-currency hedging math (everything assumed THB). Phase 2.
- Persisting scenarios to Supabase (sessionStorage is fine for v1).
