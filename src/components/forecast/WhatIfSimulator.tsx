"use client";

/**
 * WHAT-IF SIMULATOR
 * ─────────────────
 * Real-time interactive simulation. Sliders mutate a transient
 * ScenarioAssumptions object; on every change we re-run the pure
 * forecast engine and compare against the active "base" scenario.
 *
 * No store mutation happens until the user clicks "Save as scenario".
 */

import { useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  Sliders, RotateCcw, Save, TrendingUp, TrendingDown, Minus, Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label } from "@/components/ui";
import { useStore } from "@/lib/store";
import { generateYearlyForecast } from "@/lib/engine/forecast";
import { thb } from "@/lib/utils";
import type { ScenarioAssumptions, Scenario } from "@/lib/types";

const SCENARIO_COLORS = ["#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#f59e0b", "#06b6d4", "#f97316"];

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
}

function SliderRow({ label, hint, value, min, max, step, unit, format, onChange, baseValue }: SliderRowProps) {
  const display = format ? format(value) : `${value.toFixed(unit === "%" ? 1 : 0)}${unit}`;
  const baseDisplay = format ? format(baseValue) : `${baseValue.toFixed(unit === "%" ? 1 : 0)}${unit}`;
  const delta = value - baseValue;
  const deltaPct = baseValue !== 0 ? (delta / Math.abs(baseValue)) * 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-xs font-semibold tabular-nums">{display}</span>
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
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
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

interface DeltaTileProps {
  label: string;
  baseValue: string;
  simValue: string;
  baseRaw: number;
  simRaw: number;
  invertGood?: boolean;  // when true, lower is better (e.g. payoff year)
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
        <span className="tabular-nums">
          base {baseValue}
        </span>
      </div>
    </div>
  );
}

export function WhatIfSimulator() {
  const store = useStore();
  const {
    profile, incomes, expenses, debts, investments, retirement,
    scenarios, activeScenarioId, addScenario,
  } = store;

  const baseScenario: Scenario =
    scenarios.find(s => s.id === activeScenarioId) ??
    scenarios[0];

  const baseAssumptions = baseScenario.assumptions;

  // Live tweaks — never written back to the store unless saved.
  const [sim, setSim] = useState<ScenarioAssumptions>({
    incomeGrowthRate: baseAssumptions.incomeGrowthRate ?? 0.04,
    inflationRate: baseAssumptions.inflationRate ?? 0.03,
    investmentReturnRate: baseAssumptions.investmentReturnRate ?? 0.07,
    mortgageExtraMonthlyPayment: baseAssumptions.mortgageExtraMonthlyPayment ?? 5000,
    annualLumpSumPrepayment: baseAssumptions.annualLumpSumPrepayment ?? 0,
    annualBonusAmount: baseAssumptions.annualBonusAmount ?? 0,
    retirementAge: baseAssumptions.retirementAge ?? profile.retirementAge,
  });

  const reset = () => setSim({
    incomeGrowthRate: baseAssumptions.incomeGrowthRate ?? 0.04,
    inflationRate: baseAssumptions.inflationRate ?? 0.03,
    investmentReturnRate: baseAssumptions.investmentReturnRate ?? 0.07,
    mortgageExtraMonthlyPayment: baseAssumptions.mortgageExtraMonthlyPayment ?? 5000,
    annualLumpSumPrepayment: baseAssumptions.annualLumpSumPrepayment ?? 0,
    annualBonusAmount: baseAssumptions.annualBonusAmount ?? 0,
    retirementAge: baseAssumptions.retirementAge ?? profile.retirementAge,
  });

  const baseForecast = useMemo(
    () => generateYearlyForecast({
      profile, incomes, expenses, debts, investments, retirement, scenario: baseScenario,
    }),
    [profile, incomes, expenses, debts, investments, retirement, baseScenario]
  );

  const simScenario: Scenario = useMemo(
    () => ({
      ...baseScenario,
      id: "__sim__",
      name: "Simulation",
      description: "live what-if",
      isBase: false,
      color: "#a855f7",
      assumptions: sim,
    }),
    [baseScenario, sim]
  );

  const simForecast = useMemo(
    () => generateYearlyForecast({
      profile, incomes, expenses, debts, investments, retirement, scenario: simScenario,
    }),
    [profile, incomes, expenses, debts, investments, retirement, simScenario]
  );

  // Aligned chart data
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

  // Stat extraction helpers
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

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Live What-If Simulator</h3>
            <p className="text-[11px] text-muted-foreground">
              Drag any slider — the entire forecast re-runs in real time. Comparing against{" "}
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
        {/* Sliders panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders size={14} /> Levers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SliderRow
              label="Income growth"
              hint="annual raise"
              value={(sim.incomeGrowthRate ?? 0) * 100}
              baseValue={(baseAssumptions.incomeGrowthRate ?? 0.04) * 100}
              min={0} max={15} step={0.5} unit="%"
              format={v => `${v.toFixed(1)}%`}
              onChange={v => setSim(s => ({ ...s, incomeGrowthRate: v / 100 }))}
            />
            <SliderRow
              label="Expense inflation"
              hint="CPI assumption"
              value={(sim.inflationRate ?? 0) * 100}
              baseValue={(baseAssumptions.inflationRate ?? 0.03) * 100}
              min={0} max={10} step={0.25} unit="%"
              format={v => `${v.toFixed(2)}%`}
              onChange={v => setSim(s => ({ ...s, inflationRate: v / 100 }))}
            />
            <SliderRow
              label="Investment return"
              hint="long-run portfolio yield"
              value={(sim.investmentReturnRate ?? 0) * 100}
              baseValue={(baseAssumptions.investmentReturnRate ?? 0.07) * 100}
              min={0} max={15} step={0.25} unit="%"
              format={v => `${v.toFixed(2)}%`}
              onChange={v => setSim(s => ({ ...s, investmentReturnRate: v / 100 }))}
            />
            <SliderRow
              label="Extra mortgage payment"
              hint="extra principal each month"
              value={sim.mortgageExtraMonthlyPayment ?? 0}
              baseValue={baseAssumptions.mortgageExtraMonthlyPayment ?? 5000}
              min={0} max={50_000} step={1_000} unit=""
              format={v => thb(v)}
              onChange={v => setSim(s => ({ ...s, mortgageExtraMonthlyPayment: v }))}
            />
            <SliderRow
              label="Annual lump-sum prepay"
              hint="one-shot principal/yr"
              value={sim.annualLumpSumPrepayment ?? 0}
              baseValue={baseAssumptions.annualLumpSumPrepayment ?? 0}
              min={0} max={500_000} step={10_000} unit=""
              format={v => thb(v)}
              onChange={v => setSim(s => ({ ...s, annualLumpSumPrepayment: v }))}
            />
            <SliderRow
              label="Annual bonus"
              hint="extra cash inflow"
              value={sim.annualBonusAmount ?? 0}
              baseValue={baseAssumptions.annualBonusAmount ?? 0}
              min={0} max={1_000_000} step={10_000} unit=""
              format={v => thb(v)}
              onChange={v => setSim(s => ({ ...s, annualBonusAmount: v }))}
            />
            <SliderRow
              label="Retirement age"
              hint="when you stop earning"
              value={sim.retirementAge ?? profile.retirementAge}
              baseValue={baseAssumptions.retirementAge ?? profile.retirementAge}
              min={45} max={75} step={1} unit=" yr"
              format={v => `${v} yr`}
              onChange={v => setSim(s => ({ ...s, retirementAge: v }))}
            />
          </CardContent>
        </Card>

        {/* Right panel: chart + delta tiles */}
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
                    formatter={(v: number) => `฿${(v).toLocaleString()}K`}
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
