"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { thb, pct, calcAge } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, StatCard, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, InfoTooltip } from "@/components/ui";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, BarChart, Bar,
} from "recharts";
import { Target, CheckCircle } from "lucide-react";
import { LiveAISignal } from "@/components/forecast/LiveAISignal";
import { LiveCoach } from "@/components/forecast/LiveCoach";
import { WhatIfSimulator } from "@/components/forecast/WhatIfSimulator";

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums">{typeof p.value === "number" && Math.abs(p.value) > 100 ? thb(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ForecastPage() {
  const { yearlyForecast, monthlyForecast, profile, scenarios, activeScenarioId } = useStore();
  const [tab, setTab] = useState("yearly");
  const [tableTab, setTableTab] = useState("yearly");

  const age = calcAge(profile.dateOfBirth);
  const activeScenario = scenarios.find(s => s.id === activeScenarioId);

  const milestones = yearlyForecast.flatMap(y => y.milestones.map(m => ({ year: y.year, age: y.age, label: m })));

  const netCashFlowAlerts = monthlyForecast.filter(m => m.isNegativeCashFlow);

  // Yearly chart data
  const yearlyChartData = yearlyForecast.slice(0, 35).map(y => ({
    year: y.year,
    age: y.age,
    Income: Math.round(y.totalIncome / 1000),
    Expenses: Math.round(y.totalExpenses / 1000),
    Debt: Math.round(y.totalDebtPayments / 1000),
    "Net Worth": Math.round(y.netWorth / 1000),
    Investments: Math.round(y.investmentBalance / 1000),
    "Mortgage Bal": Math.round(y.mortgageBalance / 1000),
    "Net Cash Flow": Math.round(y.netCashFlow / 1000),
  }));

  const monthlyChartData = monthlyForecast.map(m => ({
    label: m.label,
    Income: Math.round(m.totalIncome),
    Expenses: Math.round(m.totalExpenses),
    Debts: Math.round(m.totalDebtPayments),
    "Net Flow": Math.round(m.netCashFlow),
    "Mortgage Bal": Math.round(m.mortgageBalance),
  }));

  const dtiData = yearlyForecast.slice(0, 30).map(y => ({
    year: y.year,
    age: y.age,
    DTI: (y.debtToIncomeRatio * 100).toFixed(1),
    DSR: (y.debtServiceRatio * 100).toFixed(1),
  }));

  const retirementYear = yearlyForecast.find(y => y.isRetired);
  const mortgagePayoffYear = yearlyForecast.find(y => y.isMortgagePaidOff && (yearlyForecast[0]?.mortgageBalance ?? 0) > 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Financial Forecast"
        subtitle={`Projections to age ${profile.lifeExpectancy} · Scenario: ${activeScenario?.name ?? "Base Case"}`}
      />

      {/* Live AI signal — auto-rotates through highest-priority insights */}
      <LiveAISignal />

      {/* Live AI Coach — on-demand Claude-powered summary + alerts */}
      <LiveCoach />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Retirement Year</div>
          <div className="text-2xl font-bold mt-1">{retirementYear?.year ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Age {retirementYear?.age ?? profile.retirementAge}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Mortgage Payoff</div>
          <div className="text-2xl font-bold mt-1">{mortgagePayoffYear?.year ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Age {mortgagePayoffYear?.age ?? "—"}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Net Worth at Retirement</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{thb(retirementYear?.netWorth ?? 0)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Investments {thb(retirementYear?.investmentBalance ?? 0)}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Negative Months (5yr)</div>
          <div className={`text-2xl font-bold mt-1 ${netCashFlowAlerts.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {netCashFlowAlerts.length}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{netCashFlowAlerts.length === 0 ? "All positive" : "Months with deficit"}</div>
        </div>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <CheckCircle size={12} /> {m.label} · {m.year} (Age {m.age})
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="yearly">Yearly Charts</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Charts</TabsTrigger>
          <TabsTrigger value="dti">Debt Ratios</TabsTrigger>
          <TabsTrigger value="simulator">What-If Simulator</TabsTrigger>
        </TabsList>

        <TabsContent value="simulator">
          <WhatIfSimulator />
        </TabsContent>

        <TabsContent value="yearly">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Income vs Expenses vs Debt Service (฿K)
                  <InfoTooltip content="35-year projection. Income grows annually, expenses inflate, investments compound. Net Worth = investments − all debt at year end." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={yearlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<ForecastTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Area type="monotone" dataKey="Income" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="Expenses" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="Debt" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} />
                    {retirementYear && <ReferenceLine x={retirementYear.year} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: "Retire", fontSize: 10, fill: "#8b5cf6" }} />}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Net Worth & Investment Growth (฿K)
                  <InfoTooltip content="Blue bars = investments (compound growth), red bars = debt (negative), green line = net worth = investments − debt." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={yearlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<ForecastTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="Net Worth" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Investments" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Mortgage Bal" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                    {retirementYear && <ReferenceLine x={retirementYear.year} stroke="#8b5cf6" strokeDasharray="4 4" />}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monthly">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Monthly Cash Flow (5 Year View)
                  <InfoTooltip content="Month-by-month cash flow. Net Flow = Income − Expenses − Debt Payments. Negative months shown as alerts." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={5} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: number) => thb(v)} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <ReferenceLine y={0} stroke="#6b7280" />
                    <Bar dataKey="Net Flow" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Monthly Mortgage Balance</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={5} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => thb(v)} />
                    <Area type="monotone" dataKey="Mortgage Bal" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dti">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Debt-to-Income & Debt Service Ratios Over Time
                <InfoTooltip content="DTI = total debt ÷ annual income. DSR = monthly payments ÷ monthly income. Both should trend downward as debts clear and income grows." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dtiData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "35% DSR limit", fontSize: 10, fill: "#ef4444" }} />
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "40% DTI warning", fontSize: 10, fill: "#f59e0b" }} />
                  <Line type="monotone" dataKey="DTI" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Debt-to-Income %" />
                  <Line type="monotone" dataKey="DSR" stroke="#ef4444" strokeWidth={2} dot={false} name="Debt Service Ratio %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Forecast table */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Forecast Table</h2>
          <div className="flex gap-1">
            {(["yearly", "monthly"] as const).map(t => (
              <button key={t} onClick={() => setTableTab(t)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${tableTab === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <div className="overflow-x-auto max-h-[500px]">
            {tableTab === "yearly" ? (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border bg-muted/50">
                    {["Year","Age","Net Income","Expenses","Debt Pmts","Net CF","Mortgage Bal","Investments","Net Worth","DTI","DSR","Flags"].map(h => (
                      <th key={h} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yearlyForecast.map(row => (
                    <tr key={row.year} className={`border-b border-border/50 hover:bg-muted/20 ${row.isRetired ? "bg-purple-50/50 dark:bg-purple-900/10" : ""}`}>
                      <td className="px-3 py-1.5 font-medium">{row.year}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{row.age}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalIncome)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalExpenses)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalDebtPayments)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${row.netCashFlow < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {thb(row.netCashFlow)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{thb(row.mortgageBalance)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-blue-600">{thb(row.investmentBalance)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold">{thb(row.netWorth)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(row.debtToIncomeRatio)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(row.debtServiceRatio)}</td>
                      <td className="px-3 py-1.5">
                        {row.milestones.map(m => (
                          <span key={m} className="inline-block text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded mr-1">{m}</span>
                        ))}
                        {row.isRetired && <span className="inline-block text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">Retired</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border bg-muted/50">
                    {["Month","Net Income","Expenses","Debt Pmts","Net CF","Mortgage Bal","Total Debt","Investments"].map(h => (
                      <th key={h} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyForecast.map((row, i) => (
                    <tr key={i} className={`border-b border-border/50 hover:bg-muted/20 ${row.isNegativeCashFlow ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                      <td className="px-3 py-1.5 font-medium">{row.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalIncome)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalExpenses)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalDebtPayments)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${row.netCashFlow < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {thb(row.netCashFlow)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.mortgageBalance)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.totalDebtBalance)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.investmentBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
