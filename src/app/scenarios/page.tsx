"use client";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { seedScenarios } from "@/lib/seed";
import { generateYearlyForecast } from "@/lib/engine/forecast";
import {
  analyzeInvestmentOptimization,
  analyzeTaxPlanning,
  analyzeRiskAssessment,
  analyzeSavingsAndDebt,
  analyzeGeopoliticalHedge,
  analyzeAlstomSTI,
  analyzeAlstomSTIWithLive,
  type AnalysisResult,
  type AlstomSTIAnalysis,
  type AlstomQuote,
  type AlstomReleaseInfo,
} from "@/lib/engine/ai-scenarios";
import { thb, pct } from "@/lib/utils";
import type { Scenario, ScenarioAssumptions } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  Select, Modal, Badge, StatCard, PageHeader, Alert, Separator, Tabs, TabsList, TabsTrigger, TabsContent,
  InfoTooltip, AITokenMeter
} from "@/components/ui";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import {
  Plus, Edit, Trash2, Play, BarChart3, CheckCircle, Zap, TrendingUp,
  AlertCircle, Shield, PiggyBank, Globe, Train, ExternalLink,
  ArrowUpRight, ArrowDownRight, Minus, Copy,
} from "lucide-react";

const SCENARIO_COLORS = ["#3b82f6","#10b981","#ef4444","#8b5cf6","#f59e0b","#06b6d4","#f97316"];

function defaultScenario(): Omit<Scenario, "id" | "createdAt"> {
  return {
    name: "", description: "", isBase: false,
    color: SCENARIO_COLORS[Math.floor(Math.random() * SCENARIO_COLORS.length)],
    clusters: ["Wealth Accumulation & Growth"],
    riskLevel: "medium",
    timeHorizon: "medium",
    assumptions: {
      incomeGrowthRate: 0.04, inflationRate: 0.03, investmentReturnRate: 0.07,
      mortgageExtraMonthlyPayment: 5_000, annualLumpSumPrepayment: 0,
    },
  };
}

function AssumptionField({ label, value, onChange, hint, unit = "" }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void;
  hint?: string; unit?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1">
        <Input
          type="number" step="any"
          value={value !== undefined ? (unit === "%" ? (value * 100).toFixed(2) : value) : ""}
          onChange={e => onChange(e.target.value === "" ? undefined : (unit === "%" ? Number(e.target.value) / 100 : Number(e.target.value)))}
          className="text-sm" placeholder="Use default"
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function SensitivityGauge({ name, base, low, high, unit }: {
  name: string; base: number; low: number; high: number; unit: string;
}) {
  const span = Math.max(Math.abs(high - base), Math.abs(base - low)) || 1;
  const pct = (v: number) => 50 + ((v - base) / span) * 50;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-medium">{name}</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">±20% sensitivity</span>
            <InfoTooltip content={"Red = outcome if assumption drops 20%.\nGreen = outcome if assumption rises 20%.\nCenter line = your current base case."} side="right" />
          </div>
        </div>
        <div className="relative h-3 mt-3 rounded-full bg-muted overflow-hidden">
          <div className="absolute top-0 bottom-0 bg-red-500/60" style={{ left: 0, width: `${pct(low)}%` }} />
          <div className="absolute top-0 bottom-0 bg-green-500/60" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-foreground" style={{ left: "50%" }} />
        </div>
        <div className="grid grid-cols-3 mt-2 text-[11px] text-center gap-2">
          <span className="text-red-500 font-medium">−20%<br/>{thb(low)}</span>
          <span className="font-semibold">{thb(base)}</span>
          <span className="text-green-500 font-medium">+20%<br/>{thb(high)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ScenariosPage() {
  const { scenarios, activeScenarioId, addScenario, updateScenario, deleteScenario, setActiveScenario,
    profile, incomes, expenses, debts, investments, retirement, tax } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Scenario, "id" | "createdAt">>(defaultScenario());
  const [compareIds, setCompareIds] = useState<string[]>(scenarios.slice(0, 2).map(s => s.id));
  const [tab, setTab] = useState("overview");
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [alstomSTI, setAlstomSTI] = useState<AlstomSTIAnalysis | null>(null);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [filter, setFilter] = useState<"all" | "good" | "bad" | "custom">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoadingAnalyses(true);
    (async () => {
      try {
        const results: AnalysisResult[] = [
          analyzeInvestmentOptimization({ investments, profile, income: incomes, expenses, debts }),
          analyzeTaxPlanning({ profile, income: incomes, investments, debts, tax }),
          analyzeRiskAssessment({ profile, investments, debts, income: incomes, expenses }),
          analyzeSavingsAndDebt({ profile, income: incomes, expenses, debts, investments }),
          analyzeGeopoliticalHedge({ investments, profile }),
        ];
        setAnalyses(results);

        // Fetch live Alstom quote + the latest financial-results document
        // in parallel. Each independently degrades to null on failure;
        // the STI analyzer accepts either or both being absent.
        try {
          const [quoteRes, releaseRes] = await Promise.all([
            fetch("/api/alstom/quote", { cache: "no-store" }).catch(() => null),
            fetch("/api/alstom/financial-results", { cache: "no-store" }).catch(() => null),
          ]);
          const q: AlstomQuote | null =
            quoteRes && quoteRes.ok ? await quoteRes.json() : null;
          const rel: AlstomReleaseInfo | undefined =
            releaseRes && releaseRes.ok ? await releaseRes.json() : undefined;
          const analysis = analyzeAlstomSTIWithLive(q, rel);
          setAlstomSTI(analysis);
        } catch {
          setAlstomSTI(analyzeAlstomSTI());
        }
      } catch (e) {
        console.error("Analysis error:", e);
        setAlstomSTI(analyzeAlstomSTI());
      }
      setLoadingAnalyses(false);
    })();
  }, [profile, incomes, expenses, debts, investments, retirement, tax]);

  useEffect(() => {
    if (!activeScenarioId && scenarios.length > 0) {
      setActiveScenario(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId, setActiveScenario]);

  const openAdd = () => { setFormData(defaultScenario()); setEditId(null); setModalOpen(true); };
  const openEdit = (s: Scenario) => { setFormData({ name: s.name, description: s.description, isBase: s.isBase, color: s.color, assumptions: { ...s.assumptions } }); setEditId(s.id); setModalOpen(true); };
  const handleSave = () => {
    if (!formData.name) return;
    if (editId) updateScenario(editId, formData);
    else addScenario(formData);
    setModalOpen(false);
  };
  const handleDelete = (id: string) => { if (!scenarios.find(s => s.id === id)?.isBase && confirm("Delete this scenario?")) deleteScenario(id); };
  const setField = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

  const comparisonForecasts = compareIds.map(id => {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return null;
    const forecast = generateYearlyForecast({ profile, incomes, expenses, debts, investments, retirement, scenario });
    return { scenario, forecast };
  }).filter(Boolean) as Array<{ scenario: Scenario; forecast: ReturnType<typeof generateYearlyForecast> }>;

  const sensitivityGauges = (() => {
    if (comparisonForecasts.length === 0) return [];
    const activeScenario = comparisonForecasts[0].scenario;
    const baseForecast = comparisonForecasts[0].forecast;
    const horizonIdx = Math.min(30, baseForecast.length - 1);
    const horizonYear = baseForecast[horizonIdx]?.netWorth ?? 0;

    // Compute ±20% scenarios for key variables
    const variables: Array<{ name: string; key: keyof ScenarioAssumptions; multiplier: number }> = [
      { name: "Income Growth", key: "incomeGrowthRate", multiplier: 0.04 },
      { name: "Inflation Rate", key: "inflationRate", multiplier: 0.03 },
      { name: "Investment Return", key: "investmentReturnRate", multiplier: 0.07 },
      { name: "Mortgage Payment", key: "mortgageExtraMonthlyPayment", multiplier: 1 },
      { name: "Annual Savings", key: "annualBonusAmount", multiplier: 100_000 },
      { name: "Retirement Age", key: "retirementAge", multiplier: 65 },
    ];

    return variables.map(v => {
      const baseVal = (activeScenario.assumptions[v.key] ?? v.multiplier) as number;
      const lowAssumptions = { ...activeScenario.assumptions, [v.key]: baseVal * 0.8 };
      const highAssumptions = { ...activeScenario.assumptions, [v.key]: baseVal * 1.2 };

      const lowForecast = generateYearlyForecast({ profile, incomes, expenses, debts, investments, retirement, scenario: { ...activeScenario, assumptions: lowAssumptions } });
      const highForecast = generateYearlyForecast({ profile, incomes, expenses, debts, investments, retirement, scenario: { ...activeScenario, assumptions: highAssumptions } });

      const lowVal = lowForecast[horizonIdx]?.netWorth ?? 0;
      const highVal = highForecast[horizonIdx]?.netWorth ?? 0;

      return { name: v.name, base: horizonYear, low: lowVal, high: highVal };
    });
  })();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Scenario Planner and AI Analysis"
        subtitle="Create scenarios, run comparisons, and get AI-driven financial insights"
        actions={<Button size="sm" onClick={openAdd}><Plus size={14} /> New Scenario</Button>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">All Scenarios</TabsTrigger>
          <TabsTrigger value="compare">Compare Scenarios</TabsTrigger>
          <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            {/* Filter Strip */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <Input
                placeholder="Search scenarios..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <div className="flex gap-2 flex-wrap">
                {(["all", "good", "bad", "custom"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    className="capitalize"
                  >
                    {f === "all" ? "All" : f === "good" ? "Good" : f === "bad" ? "Bad" : "Custom"}
                  </Button>
                ))}
              </div>
            </div>

            {/* Scenarios Grid - Organized by Cluster */}
            <div className="space-y-6">
              {(() => {
                const filtered = scenarios
                  .filter((s) => {
                    const matchesQuery = query === "" ||
                      s.name.toLowerCase().includes(query.toLowerCase()) ||
                      s.description.toLowerCase().includes(query.toLowerCase());
                    if (!matchesQuery) return false;

                    if (filter === "all") return true;
                    if (filter === "good") return s.tag === "good";
                    if (filter === "bad") return s.tag === "bad";
                    if (filter === "custom") {
                      const isInSeed = seedScenarios.some(seed => seed.id === s.id);
                      return !isInSeed || s.tag === "custom";
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    const aInSeed = seedScenarios.findIndex(seed => seed.id === a.id);
                    const bInSeed = seedScenarios.findIndex(seed => seed.id === b.id);
                    if (aInSeed !== -1 && bInSeed !== -1) return aInSeed - bInSeed;
                    if (aInSeed !== -1) return -1;
                    if (bInSeed !== -1) return 1;
                    return a.name.localeCompare(b.name);
                  });

                // Group by cluster
                const clusterGroups = new Map<string, Scenario[]>();
                const CLUSTERS = ["Wealth Accumulation & Growth", "Risk Management & Stability", "Income & Compensation"];

                CLUSTERS.forEach(c => clusterGroups.set(c, []));

                filtered.forEach(s => {
                  const clusters = s.clusters || ["Wealth Accumulation & Growth"];
                  clusters.forEach(c => {
                    if (clusterGroups.has(c)) {
                      clusterGroups.get(c)!.push(s);
                    }
                  });
                });

                return (
                  <>
                    {CLUSTERS.map(cluster => {
                      const items = clusterGroups.get(cluster) || [];
                      if (items.length === 0) return null;

                      return (
                        <div key={cluster}>
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                            <h3 className="text-sm font-semibold">{cluster}</h3>
                            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {items.map((s) => {
                              const isActive = s.id === activeScenarioId;
                              const isBaseScenario = s.isBase;
                              return (
                                <Card key={s.id} className={`hover:shadow-md transition-shadow flex flex-col ${isActive ? "ring-2 ring-primary" : ""}`}>
                                  <CardContent className="p-3 flex-1 flex flex-col">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <div className="font-semibold text-sm flex-1">{s.name}</div>
                                      {s.riskLevel && (
                                        <Badge variant="secondary" className="text-[9px] h-5 shrink-0">
                                          {s.riskLevel === "low" ? "🟢" : s.riskLevel === "medium" ? "🟡" : "🔴"}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2 flex-1">{s.description}</p>

                                    {/* 4-button action row */}
                                    <div className="flex gap-1 items-center mt-auto pt-2">
                                      <Button
                                        size="sm"
                                        variant={isActive ? "default" : "ghost"}
                                        className="flex-1 text-xs h-7"
                                        onClick={() => setActiveScenario(s.id)}
                                      >
                                        {isActive ? "Active" : "Activate"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0"
                                        onClick={() => openEdit(s)}
                                        title="Edit"
                                      >
                                        <Edit size={12} />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0"
                                        onClick={() => addScenario({ ...s, name: s.name + " (copy)", isBase: false, tag: undefined })}
                                        title="Copy"
                                      >
                                        <Copy size={12} />
                                      </Button>
                                      {!isBaseScenario && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0"
                                          onClick={() => handleDelete(s.id)}
                                          title="Delete"
                                        >
                                          <Trash2 size={12} />
                                        </Button>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <div className="space-y-6">
            {/* Scenario Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Select Scenarios to Compare</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {scenarios.map((s) => {
                    const isSelected = compareIds.includes(s.id);
                    return (
                      <Button
                        key={s.id}
                        variant={isSelected ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => {
                          if (isSelected) {
                            setCompareIds(compareIds.filter(id => id !== s.id));
                          } else {
                            setCompareIds([...compareIds, s.id]);
                          }
                        }}
                      >
                        <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Comparison Chart and Cards */}
            {comparisonForecasts.length === 0 ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center text-muted-foreground">Select scenarios to compare</div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Net Worth Projection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={comparisonForecasts[0].forecast.map((yearData, idx) => {
                          const point: any = { year: yearData.year };
                          comparisonForecasts.forEach((cf) => {
                            point[`netWorth_${cf.scenario.id}`] = cf.forecast[idx]?.netWorth || 0;
                          });
                          return point;
                        })}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis />
                        <Tooltip formatter={(value) => thb(value)} />
                        <Legend />
                        {comparisonForecasts.map((cf) => (
                          <Line
                            key={cf.scenario.id}
                            dataKey={`netWorth_${cf.scenario.id}`}
                            name={cf.scenario.name}
                            stroke={cf.scenario.color}
                            type="monotone"
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Final Year Comparison Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {comparisonForecasts.map((cf) => {
                    const finalYear = cf.forecast[cf.forecast.length - 1];
                    return (
                      <Card key={cf.scenario.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: cf.scenario.color }}
                            />
                            <CardTitle className="text-sm">{cf.scenario.name}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {finalYear ? thb(finalYear.netWorth) : "—"}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Final Year Net Worth</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Sensitivity Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle>Sensitivity Insights (±20% variation)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Impact on 30-year net worth projections</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sensitivityGauges.map((g, i) => (
                        <SensitivityGauge key={i} name={g.name} base={g.base} low={g.low} high={g.high} unit="฿" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analysis">
          {loadingAnalyses ? (
            <Card>
              <CardContent className="p-8">
                <div className="text-center text-muted-foreground">Analyzing financial situation...</div>
                <div className="mt-4"><AITokenMeter estimatedTokens={3000} label="5 AI modules" /></div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <AITokenMeter estimatedTokens={3000} label="5 AI modules" />

              {/* Alstom STI Payout Probability card */}
              {alstomSTI && <AlstomSTICard data={alstomSTI} />}

              {/* Existing AI modules */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {analyses.map((result) => (
                  <Card key={result.moduleId}>
                    <CardHeader>
                      <CardTitle className="text-base">{result.moduleName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{result.explanation}</p>
                      <div className="text-[10px] text-muted-foreground">
                        Confidence: {result.confidenceScore}%
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Scenario" : "New Scenario"} className="max-w-4xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Scenario Name</Label>
            <Input value={formData.name} onChange={e => setField("name", e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label>Description</Label>
            <Input value={formData.description} onChange={e => setField("description", e.target.value)} className="mt-1" placeholder="What changes in this scenario?" />
          </div>

          {/* Cluster & Risk Metadata */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Primary Cluster</Label>
              <Select value={(formData.clusters?.[0]) || "Wealth Accumulation & Growth"} onValueChange={(v) => setField("clusters", [v])}>
                <Select.Trigger className="mt-1">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="Wealth Accumulation & Growth">Wealth</Select.Item>
                  <Select.Item value="Risk Management & Stability">Risk</Select.Item>
                  <Select.Item value="Income & Compensation">Income</Select.Item>
                </Select.Content>
              </Select>
            </div>

            <div>
              <Label>Risk Level</Label>
              <Select value={formData.riskLevel || "medium"} onValueChange={(v) => setField("riskLevel", v as "low" | "medium" | "high")}>
                <Select.Trigger className="mt-1">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="low">Low</Select.Item>
                  <Select.Item value="medium">Medium</Select.Item>
                  <Select.Item value="high">High</Select.Item>
                </Select.Content>
              </Select>
            </div>

            <div>
              <Label>Time Horizon</Label>
              <Select value={formData.timeHorizon || "medium"} onValueChange={(v) => setField("timeHorizon", v as "short" | "medium" | "long")}>
                <Select.Trigger className="mt-1">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="short">1-2 years</Select.Item>
                  <Select.Item value="medium">3-5 years</Select.Item>
                  <Select.Item value="long">5+ years</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>

          {/* Growth & Inflation */}
          <details className="border border-border rounded-lg p-3">
            <summary className="cursor-pointer font-semibold text-sm">Growth & Inflation</summary>
            <div className="space-y-3 mt-3 grid grid-cols-2 gap-3">
              <AssumptionField
                label="Income Growth Rate"
                value={formData.assumptions.incomeGrowthRate}
                onChange={v => setField("assumptions", { ...formData.assumptions, incomeGrowthRate: v })}
                unit="%"
                hint="Annual growth rate for income"
              />
              <AssumptionField
                label="Expense Inflation Override"
                value={formData.assumptions.expenseInflationOverride}
                onChange={v => setField("assumptions", { ...formData.assumptions, expenseInflationOverride: v })}
                unit="%"
                hint="Override default inflation rate"
              />
              <AssumptionField
                label="Investment Return Rate"
                value={formData.assumptions.investmentReturnRate}
                onChange={v => setField("assumptions", { ...formData.assumptions, investmentReturnRate: v })}
                unit="%"
                hint="Expected annual returns"
              />
              <AssumptionField
                label="Investment Volatility"
                value={formData.assumptions.investmentVolatility}
                onChange={v => setField("assumptions", { ...formData.assumptions, investmentVolatility: v })}
                unit="%"
                hint="Standard deviation for sensitivity bands"
              />
            </div>
          </details>

          {/* Mortgage */}
          <details className="border border-border rounded-lg p-3">
            <summary className="cursor-pointer font-semibold text-sm">Mortgage</summary>
            <div className="space-y-3 mt-3 grid grid-cols-2 gap-3">
              <AssumptionField
                label="Extra Monthly Payment"
                value={formData.assumptions.mortgageExtraMonthlyPayment}
                onChange={v => setField("assumptions", { ...formData.assumptions, mortgageExtraMonthlyPayment: v })}
                hint="Extra principal payment per month"
              />
              <AssumptionField
                label="Annual Lump Sum Prepayment"
                value={formData.assumptions.annualLumpSumPrepayment}
                onChange={v => setField("assumptions", { ...formData.assumptions, annualLumpSumPrepayment: v })}
                hint="One-time annual prepayment"
              />
              <AssumptionField
                label="Refinance Year"
                value={formData.assumptions.refinanceYear}
                onChange={v => setField("assumptions", { ...formData.assumptions, refinanceYear: v })}
                unit="yr"
                hint="Year to refinance"
              />
              <AssumptionField
                label="Refinance Rate"
                value={formData.assumptions.refinanceRate}
                onChange={v => setField("assumptions", { ...formData.assumptions, refinanceRate: v })}
                unit="%"
                hint="New interest rate"
              />
              <AssumptionField
                label="Mortgage Rate Change"
                value={formData.assumptions.mortgageRateChange}
                onChange={v => setField("assumptions", { ...formData.assumptions, mortgageRateChange: v })}
                unit="%"
                hint="Rate change magnitude"
              />
              <AssumptionField
                label="Rate Change Year"
                value={formData.assumptions.mortgageRateChangeYear}
                onChange={v => setField("assumptions", { ...formData.assumptions, mortgageRateChangeYear: v })}
                unit="yr"
                hint="Year rate change occurs"
              />
            </div>
          </details>

          {/* Career Events */}
          <details className="border border-border rounded-lg p-3">
            <summary className="cursor-pointer font-semibold text-sm">Career Events</summary>
            <div className="space-y-3 mt-3 grid grid-cols-2 gap-3">
              <AssumptionField
                label="Salary Raise Year"
                value={formData.assumptions.salaryRaiseYear}
                onChange={v => setField("assumptions", { ...formData.assumptions, salaryRaiseYear: v })}
                unit="yr"
                hint="Year of pay bump"
              />
              <AssumptionField
                label="Salary Raise Factor"
                value={formData.assumptions.salaryRaiseFactor}
                onChange={v => setField("assumptions", { ...formData.assumptions, salaryRaiseFactor: v })}
                hint="e.g., 1.15 = +15%"
              />
              <AssumptionField
                label="Income Shock Year"
                value={formData.assumptions.incomeShockYear}
                onChange={v => setField("assumptions", { ...formData.assumptions, incomeShockYear: v })}
                unit="yr"
                hint="Year shock occurs"
              />
              <AssumptionField
                label="Income Shock Factor"
                value={formData.assumptions.incomeShockFactor}
                onChange={v => setField("assumptions", { ...formData.assumptions, incomeShockFactor: v })}
                hint="e.g., 0.5 = -50%"
              />
              <AssumptionField
                label="Income Shock Duration"
                value={formData.assumptions.incomeShockDuration}
                onChange={v => setField("assumptions", { ...formData.assumptions, incomeShockDuration: v })}
                unit="mo"
                hint="Duration in months"
              />
              <AssumptionField
                label="Retirement Age"
                value={formData.assumptions.retirementAge}
                onChange={v => setField("assumptions", { ...formData.assumptions, retirementAge: v })}
                unit="yr"
                hint="Age to retire"
              />
            </div>
          </details>

          {/* Cash Events */}
          <details className="border border-border rounded-lg p-3">
            <summary className="cursor-pointer font-semibold text-sm">Cash Events</summary>
            <div className="space-y-3 mt-3 grid grid-cols-2 gap-3">
              <AssumptionField
                label="Annual Bonus"
                value={formData.assumptions.annualBonusAmount}
                onChange={v => setField("assumptions", { ...formData.assumptions, annualBonusAmount: v })}
                hint="Annual bonus amount"
              />
              <AssumptionField
                label="Tax Relief Investment"
                value={formData.assumptions.taxReliefInvestmentAmount}
                onChange={v => setField("assumptions", { ...formData.assumptions, taxReliefInvestmentAmount: v })}
                hint="Tax relief investment amount"
              />
              <AssumptionField
                label="Emergency Fund Target"
                value={formData.assumptions.emergencyFundTargetMonths}
                onChange={v => setField("assumptions", { ...formData.assumptions, emergencyFundTargetMonths: v })}
                unit="mo"
                hint="Months of expenses"
              />
              <AssumptionField
                label="Windfall Year"
                value={formData.assumptions.windfallYear}
                onChange={v => setField("assumptions", { ...formData.assumptions, windfallYear: v })}
                unit="yr"
                hint="Year of windfall"
              />
              <AssumptionField
                label="Windfall Amount"
                value={formData.assumptions.windfallAmount}
                onChange={v => setField("assumptions", { ...formData.assumptions, windfallAmount: v })}
                hint="Lump sum amount"
              />
            </div>
          </details>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name}>Save Scenario</Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlstomSTICard renders the Alstom STI payout probability analysis based on
// the Group's preliminary FY 2025/26 results vs. its FY 2025/26 commitments.
// ---------------------------------------------------------------------------
function AlstomSTICard({ data }: { data: AlstomSTIAnalysis }) {
  const statusColor = (s: AlstomSTIAnalysis["criteria"][number]["status"]) =>
    s === "exceeded" ? "text-emerald-600 dark:text-emerald-400"
    : s === "met"      ? "text-sky-600 dark:text-sky-400"
    : s === "partial"  ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  const statusIcon = (s: AlstomSTIAnalysis["criteria"][number]["status"]) =>
    s === "exceeded" ? <ArrowUpRight size={14} />
    : s === "met"      ? <CheckCircle size={14} />
    : s === "partial"  ? <Minus size={14} />
    : <ArrowDownRight size={14} />;

  const badgeColor =
    data.expectedPayoutRatio >= 100 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : data.expectedPayoutRatio >= 80  ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
    : data.expectedPayoutRatio >= 50  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";

  const release = data.release;
  const auditedBanner =
    release?.found &&
    release.classification === "annual-results-audited" &&
    release.isPostPreliminary;
  const stageSubtitle =
    data.resultsStage === "audited"
      ? `Audited release detected${release?.documentDate ? ` (${release.documentDate})` : ""}`
      : "Preliminary results published 16-Apr-2026 · awaiting audited release";

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Train size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{data.moduleName}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.fiscalYear} · {stageSubtitle}
            </p>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${badgeColor}`}>
            {data.verdict}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* New-release banner — fires only when /api/alstom/financial-results
            confirms a post-preliminary audited document is live. */}
        {auditedBanner && release && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex items-start gap-2">
            <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                New audited FY 2025/26 document detected
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {release.documentLabel} · {release.documentDate}
              </div>
            </div>
            <a
              href={release.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              <ExternalLink size={11} /> Open PDF
            </a>
          </div>
        )}

        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Expected STI payout
            </div>
            <div className="text-2xl font-bold mt-1">
              {data.expectedPayoutRatio}<span className="text-sm font-medium text-muted-foreground">% of target</span>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              P(payout ≥ 100%)
            </div>
            <div className="text-2xl font-bold mt-1">
              ~{Math.max(0, data.payoutProbability)}<span className="text-sm font-medium text-muted-foreground">%</span>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Confidence
            </div>
            <div className="text-2xl font-bold mt-1">
              {data.confidenceScore}<span className="text-sm font-medium text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* Criteria table */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Commitment vs. preliminary actual
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">KPI</th>
                  <th className="px-3 py-2 font-medium">Weight</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Actual</th>
                  <th className="px-3 py-2 font-medium text-right">Payout factor</th>
                </tr>
              </thead>
              <tbody>
                {data.criteria.map(c => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{Math.round(c.weight * 100)}%</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.targetLabel}</td>
                    <td className={`px-3 py-2 font-medium ${statusColor(c.status)}`}>{c.actualLabel}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium ${statusColor(c.status)}`}>
                        {statusIcon(c.status)}
                        {Math.round(c.payoutFactor * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-KPI commentary */}
          <div className="space-y-1.5 pt-1">
            {data.criteria.map(c => (
              <div key={c.id} className="text-xs text-muted-foreground">
                <span className={`font-semibold ${statusColor(c.status)}`}>{c.name}:</span> {c.commentary}
              </div>
            ))}
          </div>
        </div>

        {/* Narrative */}
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Assessment
          </div>
          <p className="text-sm leading-relaxed">{data.narrative}</p>
        </div>

        {/* Sources */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sources
          </div>
          <ul className="space-y-1">
            {data.sources.map(s => (
              <li key={s.url} className="text-xs">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 text-primary hover:underline"
                >
                  <ExternalLink size={11} className="mt-0.5 shrink-0" />
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Live Price Indicator */}
        {data.livePrice && (
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2 p-2 bg-muted/30 rounded">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live ALO.PA: <span className="font-semibold text-foreground">EUR {data.livePrice.price.toFixed(2)}</span>
            · 1Y {(data.livePrice.change1y * 100).toFixed(1)}%
            · as of {data.livePrice.asOf.slice(0, 16).replace("T", " ")} UTC
            · src: {data.livePrice.source}
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-3">
          <strong>Disclaimer:</strong> {data.disclaimer}
        </div>
      </CardContent>
    </Card>
  );
}
