"use client";

/**
 * WHAT-IF SIMULATOR (v2)
 * ─────────────────────
 * Real-time interactive simulation. Sliders mutate a transient
 * ScenarioAssumptions object; on every change we re-run the pure
 * forecast engine and compare against the active "base" scenario.
 *
 * Levers are now grouped into 3 tabs:
 *   A. Macro & Returns (5 levers)
 *   B. Housing & Debt  (6 levers)
 *   C. Career & Cashflow (11 levers)
 *
 * An AI sensitivity strip above the tabs ranks the top-3 highest-impact
 * levers from analyzeLeverSensitivity() so the user knows where to focus.
 *
 * No store mutation happens until the user clicks "Save as scenario".
 */

import { useMemo, useState, useDeferredValue } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  Sliders, RotateCcw, Save, TrendingUp, TrendingDown, Minus, Sparkles,
  Zap,
} from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Label,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { generateYearlyForecast } from "@/lib/engine/forecast";
import { analyzeLeverSensitivity } from "@/lib/engine/ai-scenarios";
import { thb } from "@/lib/utils";
import type { ScenarioAssumptions, Scenario } from "@/lib/types";

const SCENARIO_COLORS = ["#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#f59e0b", "#06b6d4", "#f97316"];
const NOW = new Date().getFullYear();

// ---------------------------------------------------------------------------
// SliderRow
// ---------------------------------------------------------------------------
interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  baseValue: number;
  impactPct?: number;   // signed % change in final NW from sensitivity probe
  isActive?: boolean;   // currently being dragged
}

function SliderRow({
  label, hint, value, min, max, step, unit, format,
  onChange, baseValue, impactPct, isActive,
}: SliderRowProps) {
  const display = format ? format(value) : `${value.toFixed(unit === "%" ? 1 : 0)}${unit}`;
  const baseDisplay = format ? format(baseValue) : `${baseValue.toFixed(unit === "%" ? 1 : 0)}${unit}`;
  const delta = value - baseValue;
  const deltaPct = baseValue !== 0 ? (delta / Math.abs(baseValue)) * 100 : 0;

  return (
    <div className={`space-y-1 rounded-lg p-2 transition-colors ${isActive ? "bg-purple-500/8" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium leading-none">{label}</Label>
        <div className="flex items-center gap-1.5">
          {/* Live impact bar */}
          {impactPct !== undefined && Math.abs(impactPct) > 0.01 && (
            <span
              className={`text-[9px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
                impactPct > 0 ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"
              }`}
            >
              {impactPct > 0 ? "+" : ""}{impactPct.toFixed(1)}%
            </span>
          )}
          <span className="text-xs font-semibold tabular-nums">{display}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary cursor-pointer"
      />
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{hint}</span>
        <span className="tabular-nums">
          base {baseDisplay}
          {Math.abs(delta) > 0.0001 && (
            <span className={delta > 0 ? "ml-1 text-emerald-600" : "ml-1 text-red-600"}>
              ({delta > 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeltaTile
// ---------------------------------------------------------------------------
interface DeltaTileProps {
  label: string;
  baseValue: string;
  simValue: string;
  baseRaw: number;
  simRaw: number;
  invertGood?: boolean;
}

function DeltaTile({ label, baseValue, simValue, baseRaw, simRaw, invertGood }: DeltaTileProps) {
  const diff = simRaw - baseRaw;
  const better = invertGood ? diff < 0 : diff > 0;
  const same = Math.abs(diff) < 0.5;
  const Icon = same ? Minus : better ? TrendingUp : TrendingDown;
  const color = same ? "text-muted-foreground" : better ? "text-emerald-600" : "text-red-600";

  return (
    <div className="rounded-lg border border-border p-3 bg-card/50">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums leading-tight">{simValue}</div>
      <div className={`flex items-center gap-1 text-xs mt-1 ${color}`}>
        <Icon size={11} />
        <span className="tabular-nums">base {baseValue}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AISuggestionStrip — shows top-3 lever recommendations
// ---------------------------------------------------------------------------
interface AISuggestionChip {
  label: string;
  deltaNetWorthPct: number;
  deltaPayoffYears: number;
  confidence: number;
}

function AISuggestionStrip({ chips }: { chips: AISuggestionChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
        <Sparkles size={10} className="text-purple-500" /> AI suggests:
      </span>
      {chips.map((c, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-medium ${
            c.deltaNetWorthPct > 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300"
              : "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:border-orange-700 dark:text-orange-300"
          }`}
        >
          <Zap size={9} />
          {c.label}
          {c.deltaNetWorthPct !== 0 && (
            <span className="opacity-70">
              {c.deltaNetWorthPct > 0 ? "+" : ""}{c.deltaNetWorthPct.toFixed(1)}%
            </span>
          )}
          {c.deltaPayoffYears !== 0 && (
            <span className="opacity-70">
              {c.deltaPayoffYears < 0 ? ` · ${Math.abs(c.deltaPayoffYears)}yr sooner` : ""}
            </span>
          )}
          <span
            className="opacity-50 ml-0.5"
            title={`Confidence: ${c.confidence}%`}
          >
            {c.confidence >= 85 ? "●●●" : c.confidence >= 70 ? "●●○" : "●○○"}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatIfSimulator
// ---------------------------------------------------------------------------
export function WhatIfSimulator() {
  const store = useStore();
  const {
    profile, incomes, expenses, debts, investments, retirement,
    scenarios, activeScenarioId, addScenario,
  } = store;

  const baseScenario: Scenario =
    scenarios.find(s => s.id === activeScenarioId) ?? scenarios[0];

  const ba = baseScenario.assumptions;

  // Live tweaks — never written back to the store unless saved.
  const defaultSim = (): ScenarioAssumptions => ({
    // Macro & Returns
    incomeGrowthRate: ba.incomeGrowthRate ?? 0.04,
    inflationRate: ba.inflationRate ?? 0.03,
    expenseInflationOverride: ba.expenseInflationOverride ?? ba.inflationRate ?? 0.03,
    investmentReturnRate: ba.investmentReturnRate ?? 0.07,
    investmentVolatility: ba.investmentVolatility ?? 0.12,
    // Housing & Debt
    mortgageExtraMonthlyPayment: ba.mortgageExtraMonthlyPayment ?? 5_000,
    annualLumpSumPrepayment: ba.annualLumpSumPrepayment ?? 0,
    mortgageRateChange: ba.mortgageRateChange ?? 0,
    mortgageRateChangeYear: ba.mortgageRateChangeYear ?? NOW + 1,
    refinanceYear: ba.refinanceYear ?? NOW + 3,
    refinanceRate: ba.refinanceRate ?? 0.04,
    // Career & Cashflow
    annualBonusAmount: ba.annualBonusAmount ?? 0,
    retirementAge: ba.retirementAge ?? profile.retirementAge,
    salaryRaiseYear: ba.salaryRaiseYear ?? NOW + 2,
    salaryRaiseFactor: ba.salaryRaiseFactor ?? 1.0,
    incomeShockYear: ba.incomeShockYear ?? NOW + 2,
    incomeShockFactor: ba.incomeShockFactor ?? 1.0,
    incomeShockDuration: ba.incomeShockDuration ?? 0,
    taxReliefInvestmentAmount: ba.taxReliefInvestmentAmount ?? 0,
    emergencyFundTargetMonths: ba.emergencyFundTargetMonths ?? profile.emergencyFundTargetMonths ?? 6,
    windfallYear: ba.windfallYear ?? NOW + 5,
    windfallAmount: ba.windfallAmount ?? 0,
  });

  const [sim, setSim] = useState<ScenarioAssumptions>(defaultSim);
  const [leverTab, setLeverTab] = useState("macro");

  const reset = () => setSim(defaultSim());

  // Deferred sim for sensitivity probe (avoids stutter during drag)
  const deferredSim = useDeferredValue(sim);

  const baseForecast = useMemo(
    () => generateYearlyForecast({ profile, incomes, expenses, debts, investments, retirement, scenario: baseScenario }),
    [profile, incomes, expenses, debts, investments, retirement, baseScenario]
  );

  const simScenario: Scenario = useMemo(
    () => ({ ...baseScenario, id: "__sim__", name: "Simulation", description: "live what-if", isBase: false, color: "#a855f7", assumptions: sim }),
    [baseScenario, sim]
  );

  const simForecast = useMemo(
    () => generateYearlyForecast({ profile, incomes, expenses, debts, investments, retirement, scenario: simScenario }),
    [profile, incomes, expenses, debts, investments, retirement, simScenario]
  );

  // AI lever sensitivity (deferred — runs after drag ends)
  const sensitivityResults = useMemo(() => {
    const forecastFn = (a: ScenarioAssumptions) =>
      generateYearlyForecast({
        profile, incomes, expenses, debts, investments, retirement,
        scenario: { ...baseScenario, id: "__probe__", assumptions: a },
      });
    return analyzeLeverSensitivity({ base: ba, current: deferredSim, forecast: forecastFn });
  }, [profile, incomes, expenses, debts, investments, retirement, baseScenario, ba, deferredSim]);

  // Build a field→impactPct map for per-lever badges
  const impactMap = useMemo(() => {
    const m: Partial<Record<keyof ScenarioAssumptions, number>> = {};
    for (const r of sensitivityResults) {
      m[r.field] = r.deltaNetWorthPct;
    }
    return m;
  }, [sensitivityResults]);

  // Top 3 chips for the AI strip
  const topChips: AISuggestionChip[] = useMemo(
    () =>
      sensitivityResults
        .filter(r => Math.abs(r.deltaNetWorthPct) > 0.01)
        .slice(0, 3)
        .map(r => ({
          label: r.label,
          deltaNetWorthPct: r.deltaNetWorthPct,
          deltaPayoffYears: r.deltaPayoffYears,
          confidence: r.confidence,
        })),
    [sensitivityResults]
  );

  // Chart data
  const chartData = useMemo(() => {
    return baseForecast.slice(0, 40).map((b, i) => {
      const s = simForecast[i];
      return {
        year: b.year,
        Base: Math.round(b.netWorth / 1000),
        Simulation: s ? Math.round(s.netWorth / 1000) : 0,
        Delta: s ? Math.round((s.netWorth - b.netWorth) / 1000) : 0,
      };
    });
  }, [baseForecast, simForecast]);

  // Stat helpers
  const findRetirementYear = (rows: typeof baseForecast) => rows.find(r => r.isRetired);
  const findMortgagePayoffYear = (rows: typeof baseForecast) =>
    rows.find(r => r.isMortgagePaidOff && rows[0].mortgageBalance > 0);
  const findDebtFreeYear = (rows: typeof baseForecast) =>
    rows.find(r => r.totalDebtBalance <= 0 && rows[0].totalDebtBalance > 0);

  const baseRetirement = findRetirementYear(baseForecast);
  const simRetirement = findRetirementYear(simForecast);
  const baseMortgage = findMortgagePayoffYear(baseForecast);
  const simMortgage = findMortgagePayoffYear(simForecast);
  const baseDebtFree = findDebtFreeYear(baseForecast);
  const simDebtFree = findDebtFreeYear(simForecast);
  const baseFinalNW = baseForecast[baseForecast.length - 1]?.netWorth ?? 0;
  const simFinalNW = simForecast[simForecast.length - 1]?.netWorth ?? 0;
  const baseRetNW = baseRetirement?.netWorth ?? 0;
  const simRetNW = simRetirement?.netWorth ?? 0;

  // Check if any lever in a tab differs from base
  const macroChanged = [
    sim.incomeGrowthRate !== (ba.incomeGrowthRate ?? 0.04),
    sim.inflationRate !== (ba.inflationRate ?? 0.03),
    sim.expenseInflationOverride !== (ba.expenseInflationOverride ?? ba.inflationRate ?? 0.03),
    sim.investmentReturnRate !== (ba.investmentReturnRate ?? 0.07),
    sim.investmentVolatility !== (ba.investmentVolatility ?? 0.12),
  ].some(Boolean);

  const housingChanged = [
    sim.mortgageExtraMonthlyPayment !== (ba.mortgageExtraMonthlyPayment ?? 5_000),
    sim.annualLumpSumPrepayment !== (ba.annualLumpSumPrepayment ?? 0),
    sim.mortgageRateChange !== (ba.mortgageRateChange ?? 0),
    sim.refinanceYear !== (ba.refinanceYear ?? NOW + 3),
    sim.refinanceRate !== (ba.refinanceRate ?? 0.04),
  ].some(Boolean);

  const careerChanged = [
    sim.annualBonusAmount !== (ba.annualBonusAmount ?? 0),
    sim.retirementAge !== (ba.retirementAge ?? profile.retirementAge),
    sim.salaryRaiseFactor !== (ba.salaryRaiseFactor ?? 1.0),
    sim.incomeShockFactor !== (ba.incomeShockFactor ?? 1.0),
    sim.taxReliefInvestmentAmount !== (ba.taxReliefInvestmentAmount ?? 0),
    sim.windfallAmount !== (ba.windfallAmount ?? 0),
  ].some(Boolean);

  const handleSave = () => {
    const name = window.prompt("Name this scenario:", `Sim ${new Date().toLocaleDateString()}`);
    if (!name) return;
    addScenario({
      name,
      description: "Saved from What-If simulator",
      isBase: false,
      color: SCENARIO_COLORS[Math.floor(Math.random() * SCENARIO_COLORS.length)],
      assumptions: { ...sim },
    });
  };

  // Helper: tab label with change indicator dot
  const TabLabel = ({ label, changed }: { label: string; changed: boolean }) => (
    <span className="flex items-center gap-1">
      {label}
      {changed && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Live What-If Simulator</h3>
            <p className="text-[11px] text-muted-foreground">
              Drag any slider — forecast re-runs in real time. Comparing against{" "}
              <span className="font-medium">{baseScenario.name}</span>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw size={12} /> Reset
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save size={12} /> Save as scenario
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Levers panel ────────────────────────────────── */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders size={14} /> Levers
            </CardTitle>
            {/* AI suggestions strip */}
            <AISuggestionStrip chips={topChips} />
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs value={leverTab} onValueChange={setLeverTab}>
              <TabsList className="w-full mb-3 text-[10px]">
                <TabsTrigger value="macro" className="flex-1 text-[10px] px-1">
                  <TabLabel label="Macro" changed={macroChanged} />
                </TabsTrigger>
                <TabsTrigger value="housing" className="flex-1 text-[10px] px-1">
                  <TabLabel label="Housing" changed={housingChanged} />
                </TabsTrigger>
                <TabsTrigger value="career" className="flex-1 text-[10px] px-1">
                  <TabLabel label="Career" changed={careerChanged} />
                </TabsTrigger>
              </TabsList>

              {/* ── Group A: Macro & Returns ── */}
              <TabsContent value="macro" className="space-y-3 mt-0">
                <SliderRow
                  label="Income growth"
                  hint="annual raise"
                  value={(sim.incomeGrowthRate ?? 0) * 100}
                  baseValue={(ba.incomeGrowthRate ?? 0.04) * 100}
                  min={0} max={15} step={0.5} unit="%"
                  format={v => `${v.toFixed(1)}%`}
                  impactPct={impactMap.incomeGrowthRate}
                  onChange={v => setSim(s => ({ ...s, incomeGrowthRate: v / 100 }))}
                />
                <SliderRow
                  label="Expense inflation (CPI)"
                  hint="cost-of-living assumption"
                  value={(sim.inflationRate ?? 0) * 100}
                  baseValue={(ba.inflationRate ?? 0.03) * 100}
                  min={0} max={10} step={0.25} unit="%"
                  format={v => `${v.toFixed(2)}%`}
                  impactPct={impactMap.inflationRate}
                  onChange={v => setSim(s => ({ ...s, inflationRate: v / 100 }))}
                />
                <SliderRow
                  label="Expense inflation override"
                  hint="override per-category CPI"
                  value={(sim.expenseInflationOverride ?? sim.inflationRate ?? 0) * 100}
                  baseValue={(ba.expenseInflationOverride ?? ba.inflationRate ?? 0.03) * 100}
                  min={0} max={15} step={0.25} unit="%"
                  format={v => `${v.toFixed(2)}%`}
                  impactPct={impactMap.expenseInflationOverride}
                  onChange={v => setSim(s => ({ ...s, expenseInflationOverride: v / 100 }))}
                />
                <SliderRow
                  label="Investment return"
                  hint="long-run portfolio yield"
                  value={(sim.investmentReturnRate ?? 0) * 100}
                  baseValue={(ba.investmentReturnRate ?? 0.07) * 100}
                  min={0} max={15} step={0.25} unit="%"
                  format={v => `${v.toFixed(2)}%`}
                  impactPct={impactMap.investmentReturnRate}
                  onChange={v => setSim(s => ({ ...s, investmentReturnRate: v / 100 }))}
                />
                <SliderRow
                  label="Investment volatility (σ)"
                  hint="std-dev for sensitivity bands"
                  value={(sim.investmentVolatility ?? 0.12) * 100}
                  baseValue={(ba.investmentVolatility ?? 0.12) * 100}
                  min={0} max={40} step={1} unit="%"
                  format={v => `${v.toFixed(0)}%`}
                  impactPct={impactMap.investmentVolatility}
                  onChange={v => setSim(s => ({ ...s, investmentVolatility: v / 100 }))}
                />
              </TabsContent>

              {/* ── Group B: Housing & Debt ── */}
              <TabsContent value="housing" className="space-y-3 mt-0">
                <SliderRow
                  label="Extra monthly payment"
                  hint="extra principal each month"
                  value={sim.mortgageExtraMonthlyPayment ?? 0}
                  baseValue={ba.mortgageExtraMonthlyPayment ?? 5_000}
                  min={0} max={50_000} step={1_000} unit=""
                  format={v => thb(v)}
                  impactPct={impactMap.mortgageExtraMonthlyPayment}
                  onChange={v => setSim(s => ({ ...s, mortgageExtraMonthlyPayment: v }))}
                />
                <SliderRow
                  label="Annual lump-sum prepay"
                  hint="one-shot principal/yr"
                  value={sim.annualLumpSumPrepayment ?? 0}
                  baseValue={ba.annualLumpSumPrepayment ?? 0}
                  min={0} max={500_000} step={10_000} unit=""
                  format={v => thb(v)}
                  impactPct={impactMap.annualLumpSumPrepayment}
                  onChange={v => setSim(s => ({ ...s, annualLumpSumPrepayment: v }))}
                />
                <SliderRow
                  label="Mortgage rate Δ"
                  hint="shift applied from rate-change year"
                  value={(sim.mortgageRateChange ?? 0) * 100}
                  baseValue={(ba.mortgageRateChange ?? 0) * 100}
                  min={-3} max={5} step={0.25} unit="%"
                  format={v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                  impactPct={impactMap.mortgageRateChange}
                  onChange={v => setSim(s => ({ ...s, mortgageRateChange: v / 100 }))}
                />
                <SliderRow
                  label="Rate-change year"
                  hint="year when rate Δ kicks in"
                  value={sim.mortgageRateChangeYear ?? NOW + 1}
                  baseValue={ba.mortgageRateChangeYear ?? NOW + 1}
                  min={NOW} max={NOW + 10} step={1} unit=""
                  format={v => String(v)}
                  impactPct={impactMap.mortgageRateChangeYear}
                  onChange={v => setSim(s => ({ ...s, mortgageRateChangeYear: v }))}
                />
                <SliderRow
                  label="Refinance year"
                  hint="year you refinance"
                  value={sim.refinanceYear ?? NOW + 3}
                  baseValue={ba.refinanceYear ?? NOW + 3}
                  min={NOW} max={NOW + 10} step={1} unit=""
                  format={v => String(v)}
                  impactPct={impactMap.refinanceYear}
                  onChange={v => setSim(s => ({ ...s, refinanceYear: v }))}
                />
                <SliderRow
                  label="Refinance rate"
                  hint="new interest rate after refi"
                  value={(sim.refinanceRate ?? 0.04) * 100}
                  baseValue={(ba.refinanceRate ?? 0.04) * 100}
                  min={2} max={10} step={0.25} unit="%"
                  format={v => `${v.toFixed(2)}%`}
                  impactPct={impactMap.refinanceRate}
                  onChange={v => setSim(s => ({ ...s, refinanceRate: v / 100 }))}
                />
              </TabsContent>

              {/* ── Group C: Career & Cashflow ── */}
              <TabsContent value="career" className="space-y-3 mt-0">
                <SliderRow
                  label="Annual bonus"
                  hint="extra cash inflow"
                  value={sim.annualBonusAmount ?? 0}
                  baseValue={ba.annualBonusAmount ?? 0}
                  min={0} max={1_000_000} step={10_000} unit=""
                  format={v => thb(v)}
                  impactPct={impactMap.annualBonusAmount}
                  onChange={v => setSim(s => ({ ...s, annualBonusAmount: v }))}
                />
                <SliderRow
                  label="Retirement age"
                  hint="when you stop earning"
                  value={sim.retirementAge ?? profile.retirementAge}
                  baseValue={ba.retirementAge ?? profile.retirementAge}
                  min={45} max={75} step={1} unit=" yr"
                  format={v => `${v} yr`}
                  impactPct={impactMap.retirementAge}
                  onChange={v => setSim(s => ({ ...s, retirementAge: v }))}
                />
                <SliderRow
                  label="Salary raise year"
                  hint="year of one-time pay bump"
                  value={sim.salaryRaiseYear ?? NOW + 2}
                  baseValue={ba.salaryRaiseYear ?? NOW + 2}
                  min={NOW} max={NOW + 10} step={1} unit=""
                  format={v => String(v)}
                  impactPct={impactMap.salaryRaiseYear}
                  onChange={v => setSim(s => ({ ...s, salaryRaiseYear: v }))}
                />
                <SliderRow
                  label="Salary raise factor"
                  hint="e.g. 1.15 = +15% pay bump"
                  value={sim.salaryRaiseFactor ?? 1.0}
                  baseValue={ba.salaryRaiseFactor ?? 1.0}
                  min={1.0} max={2.0} step={0.05} unit="×"
                  format={v => `${v.toFixed(2)}×`}
                  impactPct={impactMap.salaryRaiseFactor}
                  onChange={v => setSim(s => ({ ...s, salaryRaiseFactor: v }))}
                />
                <SliderRow
                  label="Income shock year"
                  hint="year shock occurs"
                  value={sim.incomeShockYear ?? NOW + 2}
                  baseValue={ba.incomeShockYear ?? NOW + 2}
                  min={NOW} max={NOW + 10} step={1} unit=""
                  format={v => String(v)}
                  impactPct={impactMap.incomeShockYear}
                  onChange={v => setSim(s => ({ ...s, incomeShockYear: v }))}
                />
                <SliderRow
                  label="Income shock factor"
                  hint="0 = total loss, 0.5 = -50%"
                  value={sim.incomeShockFactor ?? 1.0}
                  baseValue={ba.incomeShockFactor ?? 1.0}
                  min={0} max={1} step={0.05} unit="×"
                  format={v => `${v.toFixed(2)}×`}
                  impactPct={impactMap.incomeShockFactor}
                  onChange={v => setSim(s => ({ ...s, incomeShockFactor: v }))}
                />
                <SliderRow
                  label="Income shock duration"
                  hint="months of reduced income"
                  value={sim.incomeShockDuration ?? 0}
                  baseValue={ba.incomeShockDuration ?? 0}
                  min={0} max={36} step={1} unit=" mo"
                  format={v => `${v} mo`}
                  impactPct={impactMap.incomeShockDuration}
                  onChange={v => setSim(s => ({ ...s, incomeShockDuration: v }))}
                />
                <SliderRow
                  label="Tax-relief contribution"
                  hint="RMF/SSF/PVD annual total"
                  value={sim.taxReliefInvestmentAmount ?? 0}
                  baseValue={ba.taxReliefInvestmentAmount ?? 0}
                  min={0} max={500_000} step={25_000} unit=""
                  format={v => thb(v)}
                  impactPct={impactMap.taxReliefInvestmentAmount}
                  onChange={v => setSim(s => ({ ...s, taxReliefInvestmentAmount: v }))}
                />
                <SliderRow
                  label="Emergency fund target"
                  hint="months of expenses to hold"
                  value={sim.emergencyFundTargetMonths ?? 6}
                  baseValue={ba.emergencyFundTargetMonths ?? profile.emergencyFundTargetMonths ?? 6}
                  min={1} max={18} step={1} unit=" mo"
                  format={v => `${v} mo`}
                  impactPct={impactMap.emergencyFundTargetMonths}
                  onChange={v => setSim(s => ({ ...s, emergencyFundTargetMonths: v }))}
                />
                <SliderRow
                  label="Windfall year"
                  hint="year of one-time cash inflow"
                  value={sim.windfallYear ?? NOW + 5}
                  baseValue={ba.windfallYear ?? NOW + 5}
                  min={NOW} max={NOW + 10} step={1} unit=""
                  format={v => String(v)}
                  impactPct={impactMap.windfallYear}
                  onChange={v => setSim(s => ({ ...s, windfallYear: v }))}
                />
                <SliderRow
                  label="Windfall amount"
                  hint="lump-sum cash received"
                  value={sim.windfallAmount ?? 0}
                  baseValue={ba.windfallAmount ?? 0}
                  min={0} max={5_000_000} step={50_000} unit=""
                  format={v => thb(v)}
                  impactPct={impactMap.windfallAmount}
                  onChange={v => setSim(s => ({ ...s, windfallAmount: v }))}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── Right panel: charts + delta tiles ─────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Net Worth — Base vs Simulation (฿K)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number) => `฿${v.toLocaleString()}K`}
                    labelStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="Base"
                    stroke={baseScenario.color || "#94a3b8"}
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="6 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="Simulation"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Delta — Simulation minus Base (฿K)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `฿${v.toLocaleString()}K`} />
                  <ReferenceLine y={0} stroke="#6b7280" />
                  <Area
                    type="monotone"
                    dataKey="Delta"
                    stroke="#a855f7"
                    fill="#a855f7"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DeltaTile
              label="Net worth at retirement"
              baseValue={thb(baseRetNW)}
              simValue={thb(simRetNW)}
              baseRaw={baseRetNW}
              simRaw={simRetNW}
            />
            <DeltaTile
              label="Final net worth"
              baseValue={thb(baseFinalNW)}
              simValue={thb(simFinalNW)}
              baseRaw={baseFinalNW}
              simRaw={simFinalNW}
            />
            <DeltaTile
              label="Mortgage payoff year"
              baseValue={baseMortgage ? String(baseMortgage.year) : "—"}
              simValue={simMortgage ? String(simMortgage.year) : "—"}
              baseRaw={baseMortgage?.year ?? 9999}
              simRaw={simMortgage?.year ?? 9999}
              invertGood
            />
            <DeltaTile
              label="Debt free year"
              baseValue={baseDebtFree ? String(baseDebtFree.year) : "—"}
              simValue={simDebtFree ? String(simDebtFree.year) : "—"}
              baseRaw={baseDebtFree?.year ?? 9999}
              simRaw={simDebtFree?.year ?? 9999}
              invertGood
            />
          </div>
        </div>
      </div>
    </div>
  );
}
