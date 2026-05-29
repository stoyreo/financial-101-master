"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { cn, thb } from "@/lib/utils";
import { BarChart2, LineChart, Activity, Target, Trash2, Info } from "lucide-react";
import { v4 as uuid } from "uuid";
import { getSession } from "@/lib/auth-client";

import type { InvestmentAccount } from "@/lib/types";
import {
  projectPortfolio,
  sumSeries,
  monteCarlo,
  type AccountInput,
  type MonteCarloBands,
} from "@/lib/engine/projection";
import type { InvestmentScenario, ScenarioOverride } from "./snapshots";
import { loadScenarios, addScenario, removeScenario } from "./snapshots";

import { LeverPanel } from "./LeverPanel";
import { ScenarioDiffChart } from "./ScenarioDiffChart";
import { MultiScenarioLine } from "./MultiScenarioLine";
import { MonteCarloCone } from "./MonteCarloCone";
import { AIInsightStrip } from "./AIInsightStrip";
import { AICoachPanel } from "./AICoachPanel";

// ── Types ────────────────────────────────────────────────────────────────────

type PresetVectors = {
  bull: { label: string; shifts: Record<string, number> };
  bear: { label: string; shifts: Record<string, number> };
  recession: { label: string; shifts: Record<string, number> };
};

type PresetKey = "base" | "bull" | "bear" | "recession";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toAccountInputs(
  investments: InvestmentAccount[],
  overrides: ScenarioOverride[],
): AccountInput[] {
  return investments
    .filter(inv => inv.isActive)
    .map(inv => {
      const ov = overrides.find(o => o.accountId === inv.id);
      return {
        id: inv.id,
        name: inv.name,
        marketValue: inv.marketValue,
        monthlyContribution: ov?.monthlyContribOverride ?? inv.monthlyContribution,
        annualContribution: inv.annualContribution,
        expectedAnnualReturn: ov?.returnPctOverride ?? inv.expectedAnnualReturn,
        isTaxAdvantaged: inv.isTaxAdvantaged,
      };
    });
}

// Debounce helper
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  investments: InvestmentAccount[];
  retirementTarget: number;     // e.g. 15_000_000 THB
  userAge?: number;
  retirementYear?: number;
  riskProfile?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ScenarioSimulator({
  investments,
  retirementTarget,
  userAge,
  retirementYear,
  riskProfile,
}: Props) {
  const activeInvestments = investments.filter(i => i.isActive);

  // ── Scenario state ──────────────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<ScenarioOverride[]>([]);
  const [horizonYears, setHorizonYears] = useState(20);
  const [inflationPct, setInflationPct] = useState(0);
  const [applyTaxDrag, setApplyTaxDrag] = useState(false);
  const [monteCarloEnabled, setMonteCarloEnabled] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("base");
  const [activeTab, setActiveTab] = useState("diff");

  // ── Preset vectors ──────────────────────────────────────────────────────────
  const [presetVectors, setPresetVectors] = useState<PresetVectors | null>(null);
  const presetCacheRef = useRef<{ asOf: string; vectors: PresetVectors } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Check sessionStorage cache
    try {
      const cached = sessionStorage.getItem("f101:investments:preset-vectors");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.asOf === today) {
          setPresetVectors(parsed.vectors);
          presetCacheRef.current = { asOf: today, vectors: parsed.vectors };
          return;
        }
      }
    } catch { /* ignore */ }

    // Fetch from API
    fetch("/api/investments/preset-vectors", { method: "POST" })
      .then(r => r.json())
      .then(data => {
        if (data.presets) {
          setPresetVectors(data.presets);
          presetCacheRef.current = { asOf: today, vectors: data.presets };
          try {
            sessionStorage.setItem(
              "f101:investments:preset-vectors",
              JSON.stringify({ asOf: today, vectors: data.presets }),
            );
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* use fallback — null is fine, LeverPanel handles it */ });
  }, []);

  // ── Saved snapshots ─────────────────────────────────────────────────────────
  const [savedSnapshots, setSavedSnapshots] = useState<InvestmentScenario[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const session = getSession();
    if (session?.userId) {
      setSavedSnapshots(loadScenarios(session.userId));
    }
  }, []);

  // ── Projections (computed synchronously — no async, 60fps) ──────────────────
  const opts = useMemo(
    () => ({ inflationPct, applyTaxDrag, taxDragPct: 0.15 }),
    [inflationPct, applyTaxDrag],
  );

  const baseAccounts = useMemo<AccountInput[]>(
    () =>
      activeInvestments.map(inv => ({
        id: inv.id,
        name: inv.name,
        marketValue: inv.marketValue,
        monthlyContribution: inv.monthlyContribution,
        annualContribution: inv.annualContribution,
        expectedAnnualReturn: inv.expectedAnnualReturn,
        isTaxAdvantaged: inv.isTaxAdvantaged,
      })),
    [activeInvestments],
  );

  const scenarioAccounts = useMemo(
    () => toAccountInputs(activeInvestments, overrides),
    [activeInvestments, overrides],
  );

  const basePortfolio = useMemo(
    () => sumSeries(projectPortfolio(baseAccounts, horizonYears, opts)),
    [baseAccounts, horizonYears, opts],
  );

  const scenarioPortfolio = useMemo(
    () => sumSeries(projectPortfolio(scenarioAccounts, horizonYears, opts)),
    [scenarioAccounts, horizonYears, opts],
  );

  // Monte Carlo — compute only when enabled (expensive-ish, but <500ms for 500 runs)
  const [mcBands, setMcBands] = useState<MonteCarloBands | null>(null);
  useEffect(() => {
    if (!monteCarloEnabled) { setMcBands(null); return; }
    const bands = monteCarlo(scenarioAccounts, horizonYears, 500, 0.15, 42, opts);
    setMcBands(bands);
  }, [monteCarloEnabled, scenarioAccounts, horizonYears, opts]);

  // ── Saved-snapshot projections ──────────────────────────────────────────────
  const savedSnapshotSeries = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const snap of savedSnapshots) {
      const accs = toAccountInputs(activeInvestments, snap.overrides);
      const snapOpts = {
        inflationPct: snap.inflationPct,
        applyTaxDrag: snap.applyTaxDrag,
        taxDragPct: snap.taxDragPct,
      };
      result[snap.id] = sumSeries(projectPortfolio(accs, snap.horizonYears, snapOpts));
    }
    return result;
  }, [savedSnapshots, activeInvestments]);

  // ── AI insight trigger — debounced 400ms after override change ──────────────
  const [insightTrigger, setInsightTrigger] = useState(0);
  const debouncedOverrides = useDebounce(overrides, 400);
  const debouncedHorizon = useDebounce(horizonYears, 400);
  const debouncedInflation = useDebounce(inflationPct, 400);
  const debouncedTaxDrag = useDebounce(applyTaxDrag, 400);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setInsightTrigger(t => t + 1);
  }, [debouncedOverrides, debouncedHorizon, debouncedInflation, debouncedTaxDrag]);

  // ── Per-account delta cards ──────────────────────────────────────────────────
  const deltaByAccount = useMemo(() => {
    return activeInvestments.map(inv => {
      const ov = overrides.find(o => o.accountId === inv.id);
      const baseAcc: AccountInput = {
        id: inv.id, name: inv.name,
        marketValue: inv.marketValue,
        monthlyContribution: inv.monthlyContribution,
        annualContribution: inv.annualContribution,
        expectedAnnualReturn: inv.expectedAnnualReturn,
        isTaxAdvantaged: inv.isTaxAdvantaged,
      };
      const scenAcc: AccountInput = {
        ...baseAcc,
        expectedAnnualReturn: ov?.returnPctOverride ?? inv.expectedAnnualReturn,
        monthlyContribution: ov?.monthlyContribOverride ?? inv.monthlyContribution,
      };
      const baseSeries = projectPortfolio([baseAcc], horizonYears, opts);
      const scenSeries = projectPortfolio([scenAcc], horizonYears, opts);
      const baseEnd = baseSeries[0].series[horizonYears] ?? 0;
      const scenEnd = scenSeries[0].series[horizonYears] ?? 0;
      return {
        name: inv.name,
        baseEnd,
        scenarioEnd: scenEnd,
        returnDelta: (ov?.returnPctOverride ?? inv.expectedAnnualReturn) - inv.expectedAnnualReturn,
        contribDelta: (ov?.monthlyContribOverride ?? inv.monthlyContribution) - inv.monthlyContribution,
      };
    });
  }, [activeInvestments, overrides, horizonYears, opts]);

  // ── Goal-seek: find year portfolio hits retirementTarget ────────────────────
  const goalYear = useMemo(() => {
    const findHitYear = (series: number[]) => {
      if (!retirementTarget || retirementTarget <= 0) return null;
      for (let i = 0; i < series.length; i++) {
        if (series[i] >= retirementTarget) return new Date().getFullYear() + i;
      }
      return null;
    };
    return {
      base: findHitYear(basePortfolio),
      scenario: findHitYear(scenarioPortfolio),
    };
  }, [basePortfolio, scenarioPortfolio, retirementTarget]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleOverrideChange = useCallback(
    (accountId: string, field: keyof ScenarioOverride, value: number | undefined) => {
      const inv = activeInvestments.find(i => i.id === accountId);
      setOverrides(prev => {
        const existing = prev.find(o => o.accountId === accountId);
        if (existing) {
          const updated = { ...existing, [field]: value };
          // Remove override entirely if back to base values
          const isBase =
            (updated.returnPctOverride === undefined || updated.returnPctOverride === inv?.expectedAnnualReturn) &&
            (updated.monthlyContribOverride === undefined || updated.monthlyContribOverride === inv?.monthlyContribution);
          return isBase
            ? prev.filter(o => o.accountId !== accountId)
            : prev.map(o => o.accountId === accountId ? updated : o);
        }
        const newOv: ScenarioOverride = {
          accountId,
          accountName: inv?.name ?? accountId,
          accountType: inv?.accountType ?? "other",
          [field]: value,
        };
        return [...prev, newOv];
      });
      setActivePreset("custom");
    },
    [activeInvestments],
  );

  const handlePresetApply = useCallback(
    (preset: PresetKey) => {
      if (preset === "base") {
        setOverrides([]);
        setActivePreset("base");
        return;
      }
      const vectors = presetVectors?.[preset]?.shifts;
      if (!vectors) return;

      const newOverrides: ScenarioOverride[] = activeInvestments
        .map(inv => {
          const shift = vectors[inv.accountType] ?? 0;
          if (shift === 0) return null;
          return {
            accountId: inv.id,
            accountName: inv.name,
            accountType: inv.accountType,
            returnPctOverride: Math.max(-0.05, inv.expectedAnnualReturn + shift),
          } satisfies ScenarioOverride;
        })
        .filter(Boolean) as ScenarioOverride[];

      setOverrides(newOverrides);
      setActivePreset(preset);
    },
    [activeInvestments, presetVectors],
  );

  const handleReset = useCallback(() => {
    setOverrides([]);
    setHorizonYears(20);
    setInflationPct(0);
    setApplyTaxDrag(false);
    setMonteCarloEnabled(false);
    setActivePreset("base");
  }, []);

  const handleSaveSnapshot = useCallback(() => {
    const session = getSession();
    if (!session?.userId) return;

    const name = prompt(
      "Name this scenario snapshot:",
      activePreset !== "base" && activePreset !== "custom"
        ? `${activePreset.charAt(0).toUpperCase() + activePreset.slice(1)} ${new Date().getFullYear()}`
        : `Custom ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
    );
    if (!name) return;

    const snap: InvestmentScenario = {
      id: uuid(),
      name,
      horizonYears,
      inflationPct,
      applyTaxDrag,
      taxDragPct: 0.15,
      monteCarloEnabled,
      monteCarloVolPct: 0.15,
      overrides: [...overrides],
      createdAt: new Date().toISOString(),
    };

    const updated = addScenario(session.userId, snap);
    setSavedSnapshots(updated);
  }, [overrides, horizonYears, inflationPct, applyTaxDrag, monteCarloEnabled, activePreset]);

  const handleDeleteSnapshot = useCallback(
    (id: string) => {
      const session = getSession();
      if (!session?.userId) return;
      const updated = removeScenario(session.userId, id);
      setSavedSnapshots(updated);
    },
    [],
  );

  const handleToggleVisibility = useCallback((id: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Derived display values ────────────────────────────────────────────────────

  const baseFinal = basePortfolio[horizonYears] ?? 0;
  const scenFinal = scenarioPortfolio[horizonYears] ?? 0;
  const totalDelta = scenFinal - baseFinal;
  const totalDeltaPct = baseFinal > 0 ? (totalDelta / baseFinal) * 100 : 0;
  const hasChanges = overrides.length > 0 || inflationPct > 0 || applyTaxDrag;

  const profile = { age: userAge, retirementYear, riskProfile };

  const currentScenario: InvestmentScenario = {
    id: "current",
    name: activePreset === "base" ? "Base" : activePreset === "custom" ? "Custom" : activePreset,
    horizonYears,
    inflationPct,
    applyTaxDrag,
    taxDragPct: 0.15,
    monteCarloEnabled,
    monteCarloVolPct: 0.15,
    overrides,
    createdAt: new Date().toISOString(),
  };

  if (activeInvestments.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Add at least one active investment account to use the What-If Simulator.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">What-If Simulator</h2>
          <p className="text-sm text-muted-foreground">
            Drag the sliders to reshape your 20-year portfolio. AI insights fire automatically.
          </p>
        </div>
        <AICoachPanel
          scenario={currentScenario}
          baseProjection={basePortfolio}
          scenarioProjection={scenarioPortfolio}
          profile={profile}
        />
      </div>

      {/* ── Delta summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase font-medium mb-1">Base ({horizonYears}yr)</div>
          <div className="text-xl font-bold tabular-nums">{thb(baseFinal)}</div>
        </div>
        <div className={cn(
          "rounded-xl border p-4",
          hasChanges
            ? totalDelta >= 0 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
            : "border-border bg-card"
        )}>
          <div className="text-xs text-muted-foreground uppercase font-medium mb-1">Scenario ({horizonYears}yr)</div>
          <div className={cn(
            "text-xl font-bold tabular-nums",
            hasChanges && (totalDelta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
          )}>
            {thb(scenFinal)}
          </div>
          {hasChanges && (
            <div className={cn(
              "text-xs font-medium mt-0.5",
              totalDelta >= 0 ? "text-emerald-600" : "text-red-500"
            )}>
              {totalDelta >= 0 ? "+" : ""}{thb(totalDelta)} ({totalDeltaPct >= 0 ? "+" : ""}{totalDeltaPct.toFixed(1)}%)
            </div>
          )}
        </div>

        {/* Goal timeline */}
        <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
          <div className="text-xs text-muted-foreground uppercase font-medium mb-1.5">
            Goal Timeline {retirementTarget > 0 && `— Target ${thb(retirementTarget)}`}
          </div>
          {retirementTarget > 0 ? (
            <div className="flex flex-wrap gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Base hits goal</div>
                <div className="font-semibold tabular-nums text-sm">
                  {goalYear.base ? goalYear.base : `>${new Date().getFullYear() + horizonYears}`}
                </div>
              </div>
              {hasChanges && (
                <div>
                  <div className="text-xs text-muted-foreground">Scenario hits goal</div>
                  <div className={cn(
                    "font-semibold tabular-nums text-sm",
                    goalYear.scenario && goalYear.base && goalYear.scenario < goalYear.base
                      ? "text-emerald-600" : "text-foreground"
                  )}>
                    {goalYear.scenario
                      ? goalYear.base && goalYear.scenario < goalYear.base
                        ? `${goalYear.scenario} (${goalYear.base - goalYear.scenario}yr earlier)`
                        : `${goalYear.scenario}`
                      : `>${new Date().getFullYear() + horizonYears}`}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Set a retirement target in Settings to see goal tracking.</div>
          )}
        </div>
      </div>

      {/* ── AI Insight strip ────────────────────────────────────────────────── */}
      <AIInsightStrip
        trigger={insightTrigger}
        horizonYears={horizonYears}
        basePortfolioFinal={baseFinal}
        scenarioPortfolioFinal={scenFinal}
        deltaByAccount={deltaByAccount}
        presetName={activePreset}
      />

      {/* ── Per-account delta cards ──────────────────────────────────────────── */}
      {hasChanges && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {deltaByAccount.map(d => {
            const delta = d.scenarioEnd - d.baseEnd;
            const deltaPct = d.baseEnd > 0 ? (delta / d.baseEnd) * 100 : 0;
            return (
              <div key={d.name} className={cn(
                "rounded-lg border p-2.5 text-xs",
                Math.abs(delta) < 1000
                  ? "border-border bg-muted/30"
                  : delta > 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
              )}>
                <div className="font-medium truncate mb-1">{d.name}</div>
                <div className="tabular-nums text-muted-foreground">
                  {thb(d.baseEnd)}
                </div>
                <div className={cn(
                  "font-semibold tabular-nums",
                  delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {thb(d.scenarioEnd)}
                </div>
                {Math.abs(delta) >= 1000 && (
                  <div className={cn(
                    "text-xs mt-0.5",
                    delta >= 0 ? "text-emerald-600" : "text-red-500"
                  )}>
                    {delta >= 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Main body: Levers + Charts side by side ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Lever panel — 2/5 width on desktop */}
        <div className="lg:col-span-2">
          <LeverPanel
            accounts={baseAccounts}
            overrides={overrides}
            horizonYears={horizonYears}
            inflationPct={inflationPct}
            applyTaxDrag={applyTaxDrag}
            taxDragPct={0.15}
            monteCarloEnabled={monteCarloEnabled}
            monteCarloVolPct={0.15}
            presetVectors={presetVectors}
            activePreset={activePreset}
            onOverrideChange={handleOverrideChange}
            onHorizonChange={setHorizonYears}
            onInflationChange={setInflationPct}
            onTaxDragChange={setApplyTaxDrag}
            onMonteCarloChange={setMonteCarloEnabled}
            onPresetApply={handlePresetApply}
            onReset={handleReset}
            onSaveSnapshot={handleSaveSnapshot}
          />
        </div>

        {/* Charts — 3/5 width on desktop */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="diff">
                      <BarChart2 size={13} />
                      <span className="hidden sm:inline ml-1">Diff</span>
                    </TabsTrigger>
                    <TabsTrigger value="overlay">
                      <LineChart size={13} />
                      <span className="hidden sm:inline ml-1">Overlay</span>
                    </TabsTrigger>
                    {monteCarloEnabled && (
                      <TabsTrigger value="montecarlo">
                        <Activity size={13} />
                        <span className="hidden sm:inline ml-1">Cone</span>
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
                <div className="text-xs text-muted-foreground">
                  {inflationPct > 0 && <Badge variant="outline" className="mr-1">Real</Badge>}
                  {applyTaxDrag && <Badge variant="outline">After-tax</Badge>}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-2">
              {/* Diff tab */}
              {activeTab === "diff" && (
                <div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block bg-blue-300" />Base
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block bg-violet-500" />Scenario (+)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block bg-red-400" />Scenario (−)
                    </span>
                  </div>
                  <ScenarioDiffChart
                    basePortfolio={basePortfolio}
                    scenarioPortfolio={scenarioPortfolio}
                    horizonYears={horizonYears}
                  />
                </div>
              )}

              {/* Overlay tab */}
              {activeTab === "overlay" && (
                <MultiScenarioLine
                  currentYear={new Date().getFullYear()}
                  horizonYears={horizonYears}
                  baseSeries={basePortfolio}
                  scenarioSeries={scenarioPortfolio}
                  savedSnapshots={savedSnapshots}
                  savedSnapshotSeries={savedSnapshotSeries}
                  hiddenIds={hiddenIds}
                  onToggleVisibility={handleToggleVisibility}
                />
              )}

              {/* Monte Carlo tab */}
              {activeTab === "montecarlo" && monteCarloEnabled && mcBands && (
                <MonteCarloCone
                  bands={mcBands}
                  horizonYears={horizonYears}
                />
              )}
              {activeTab === "montecarlo" && monteCarloEnabled && !mcBands && (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Computing 500 paths…
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Saved snapshots list ──────────────────────────────────────────────── */}
      {savedSnapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saved Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedSnapshots.map(snap => {
                const series = savedSnapshotSeries[snap.id];
                const finalVal = series?.[snap.horizonYears] ?? 0;
                const baseFinalForSnap = basePortfolio[Math.min(snap.horizonYears, basePortfolio.length - 1)] ?? 0;
                const snapDelta = finalVal - baseFinalForSnap;
                return (
                  <div
                    key={snap.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{snap.name}</span>
                        <span className="text-xs text-muted-foreground">{snap.horizonYears}yr</span>
                        {snap.inflationPct > 0 && <Badge variant="outline" className="text-xs">Real</Badge>}
                        {snap.applyTaxDrag && <Badge variant="outline" className="text-xs">After-tax</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums font-medium text-foreground">{thb(finalVal)}</span>
                        {Math.abs(snapDelta) > 1000 && (
                          <span className={snapDelta >= 0 ? "text-emerald-600" : "text-red-500"}>
                            {snapDelta >= 0 ? "+" : ""}{thb(snapDelta)} vs base
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleVisibility(snap.id)}
                        className={cn(
                          "p-1.5 rounded-md text-xs border transition-colors",
                          !hiddenIds.has(snap.id)
                            ? "border-primary text-primary bg-primary/5"
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                        title="Toggle visibility in Overlay chart"
                      >
                        <LineChart size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snap.id)}
                        className="p-1.5 hover:bg-destructive/10 rounded-md"
                        title="Delete snapshot"
                      >
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Info size={11} />
              Snapshots are saved to this browser session only and clear on logout.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
