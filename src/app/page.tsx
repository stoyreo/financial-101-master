"use client";
import { useEffect } from "react";
import { useStore, selectMortgage, selectTotalMonthlyIncome, selectTotalMonthlyExpenses,
  selectTotalDebtBalance, selectTotalMonthlyDebtPayments, selectTotalInvestmentValue, selectNetWorth } from "@/lib/store";
import { thb, pct, calcAge, safeDivide } from "@/lib/utils";
import { summariseMortgage } from "@/lib/engine/mortgage";
import { StatCard, Card, CardHeader, CardTitle, CardContent, Badge, Progress, Alert, PageHeader, InfoTooltip } from "@/components/ui";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine,
} from "recharts";
import { Home, CreditCard, PiggyBank, AlertTriangle, CheckCircle, Target, Calendar, Wallet, TrendingUp, TrendingDown } from "lucide-react";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

function CashFlowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums font-medium">{thb(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const store = useStore();
  const { profile, debts, monthlyForecast, yearlyForecast, scenarios, activeScenarioId, recomputeForecast } = store;

  useEffect(() => { recomputeForecast(); }, []);

  const monthlyIncome = selectTotalMonthlyIncome(store);
  const monthlyExpenses = selectTotalMonthlyExpenses(store);
  const monthlyDebtPay = selectTotalMonthlyDebtPayments(store);
  const monthlyNet = monthlyIncome - monthlyExpenses - monthlyDebtPay;
  const totalDebt = selectTotalDebtBalance(store);
  const totalInvestments = selectTotalInvestmentValue(store);
  const netWorth = selectNetWorth(store);
  const age = calcAge(profile.dateOfBirth);

  const mortgage = selectMortgage(store);
  const mortgageSummary = mortgage ? summariseMortgage({
    openingBalance: mortgage.currentBalance,
    annualRate: mortgage.annualInterestRate,
    termMonths: mortgage.loanTermMonths ?? 360,
    standardMonthlyPayment: mortgage.standardMonthlyPayment,
    extraMonthlyPayment: mortgage.extraMonthlyPayment,
    annualLumpSum: mortgage.annualPrepayment ?? 0,
    startDate: mortgage.startDate,
    refinanceDate: mortgage.refinanceDate,
    refinanceNewRate: mortgage.refinanceNewRate,
    refinanceFee: mortgage.refinanceFee,
  }) : null;

  const dti = safeDivide(totalDebt, monthlyIncome * 12);
  const dsr = safeDivide(monthlyDebtPay, monthlyIncome);

  const emergencyTarget = profile.emergencyFundTargetMonths * monthlyExpenses;
  const emergencyProgress = safeDivide(profile.currentCashBalance, emergencyTarget) * 100;

  const activeScenario = scenarios.find(s => s.id === activeScenarioId);

  // Chart data
  const cashFlowData = monthlyForecast.slice(0, 24).map(m => ({
    name: m.label,
    Income: Math.round(m.totalIncome),
    Expenses: Math.round(m.totalExpenses + m.totalDebtPayments),
    "Net Flow": Math.round(m.netCashFlow),
  }));

  const debtChartData = monthlyForecast.slice(0, 60).filter((_, i) => i % 3 === 0).map(m => ({
    name: m.label,
    Mortgage: Math.round(m.mortgageBalance),
    "Other Debt": Math.round(Math.max(0, m.totalDebtBalance - m.mortgageBalance)),
  }));

  const netWorthData = yearlyForecast.slice(0, 20).map(y => ({
    name: y.year.toString(),
    "Net Worth": Math.round(y.netWorth / 1_000),
    Investments: Math.round(y.investmentBalance / 1_000),
    Debt: Math.round(-y.totalDebtBalance / 1_000),
  }));

  const expenseBreakdown = (() => {
    const cats: Record<string, number> = {};
    for (const e of store.expenses.filter(e => e.isActive && e.frequency === "monthly")) {
      cats[e.category] = (cats[e.category] ?? 0) + e.amount;
    }
    for (const e of store.expenses.filter(e => e.isActive && e.frequency === "yearly")) {
      cats[e.category] = (cats[e.category] ?? 0) + e.amount / 12;
    }
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  })();

  const retirementYear = yearlyForecast.find(y => y.isRetired);
  const retirementAssets = retirementYear?.investmentBalance ?? 0;
  const retirementNeeded = (profile.retirementAge > age)
    ? store.retirement.expectedAnnualExpense / store.retirement.safeWithdrawalRate
    : 0;
  const retirementProgress = Math.min(100, safeDivide(retirementAssets, retirementNeeded) * 100);

  const milestones = yearlyForecast.flatMap(y => y.milestones.map(m => ({ year: y.year, age: y.age, label: m })));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={`Good day, ${profile.fullName.split(" ")[0]} 👋`}
        subtitle={`Age ${age} · Scenario: ${activeScenario?.name ?? "Base Case"} · Planning to age ${profile.lifeExpectancy}`}
      />

      {/* Negative cash flow alert */}
      {monthlyNet < 0 && (
        <Alert variant="danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span className="font-medium">Negative Monthly Cash Flow: {thb(monthlyNet)}</span>
          </div>
          <p className="mt-1 text-xs opacity-80">Your expenses + debt payments exceed your income. Review your budget.</p>
        </Alert>
      )}

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Net Cash Flow"
          value={thb(monthlyNet)}
          subtitle={`Income ${thb(monthlyIncome)}`}
          icon={monthlyNet >= 0 ? TrendingUp : TrendingDown}
          color={monthlyNet >= 0 ? "green" : "red"}
          trendLabel={monthlyNet >= 0 ? "Positive cash flow" : "Review spending"}
          trend={monthlyNet >= 0 ? "up" : "down"}
          tooltip="= Monthly Income − Monthly Expenses − Monthly Debt Payments\n\nGreen ≥฿0 = surplus. Red <฿0 = overspending alert."
        />
        <StatCard
          title="Net Worth"
          value={thb(netWorth)}
          subtitle={`Assets ${thb(totalInvestments + profile.currentCashBalance)}`}
          icon={Wallet}
          color="blue"
          trendLabel={`${pct(safeDivide(netWorth - totalDebt, Math.abs(netWorth) + 1))} equity ratio`}
          tooltip="= (Investments + Cash Balance) − Total Debt\n\nEquity Ratio = (Net Worth − Debt) ÷ |Net Worth|"
        />
        <StatCard
          title="Total Debt"
          value={thb(totalDebt)}
          subtitle={`DTI ratio ${pct(dti)}`}
          icon={CreditCard}
          color={dti > 0.4 ? "red" : dti > 0.25 ? "amber" : "green"}
          trendLabel={dsr > 0.35 ? "⚠ High debt service" : "Manageable"}
          trend={dsr > 0.35 ? "down" : "neutral"}
          tooltip="DTI = Total Debt ÷ (Monthly Income × 12)\nDSR = Monthly Payments ÷ Monthly Income\n\nSafe: DTI <25%, DSR <35%"
        />
        <StatCard
          title="Total Investments"
          value={thb(totalInvestments)}
          subtitle="All accounts"
          icon={PiggyBank}
          color="purple"
          trendLabel={`+${pct(store.investments[0]?.expectedAnnualReturn ?? 0.07)} avg return`}
          trend="up"
          tooltip="Sum of all active account market values.\nWeighted Return = Σ(rate × value) ÷ total value"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Mortgage Outstanding"
          value={thb(mortgage?.currentBalance ?? 0)}
          subtitle={mortgage ? `Payoff: ${mortgageSummary?.payoffDate}` : "No mortgage"}
          icon={Home}
          color="amber"
          trendLabel={mortgageSummary ? `${thb(mortgageSummary.interestSaved)} interest saved` : undefined}
          trend="up"
          tooltip="Payoff date from month-by-month amortisation until balance = ฿0.\nInterest Saved = total interest without extra payments − total interest with extra payments."
        />
        <StatCard
          title="Monthly Debt Service"
          value={thb(monthlyDebtPay)}
          subtitle={`DSR ${pct(dsr)}`}
          icon={Calendar}
          color={dsr > 0.35 ? "red" : "blue"}
          trendLabel={dsr < 0.35 ? "Within safe range" : "Above 35% threshold"}
          trend={dsr > 0.35 ? "down" : "up"}
          tooltip="DSR = Σ monthly payments ÷ monthly income.\n<35%: Thai bank safe zone.\n>40%: loan rejection risk."
        />
        <StatCard
          title="Emergency Fund"
          value={pct(Math.min(1, safeDivide(profile.currentCashBalance, emergencyTarget)))}
          subtitle={`${thb(profile.currentCashBalance)} / ${thb(emergencyTarget)}`}
          icon={Target}
          color={emergencyProgress >= 100 ? "green" : emergencyProgress >= 50 ? "amber" : "red"}
          trendLabel={emergencyProgress >= 100 ? "Target achieved!" : `${profile.emergencyFundTargetMonths} months target`}
          trend={emergencyProgress >= 100 ? "up" : "neutral"}
          tooltip="Progress = Cash Balance ÷ (Target Months × Monthly Expenses)\nTarget months configured in your Profile."
        />
        <StatCard
          title="Retirement Readiness"
          value={`${Math.round(retirementProgress)}%`}
          subtitle={`Target: ${thb(retirementNeeded)}`}
          icon={Target}
          color={retirementProgress >= 80 ? "green" : retirementProgress >= 50 ? "amber" : "red"}
          trendLabel={`Current: ${thb(totalInvestments)}`}
          trend={retirementProgress >= 50 ? "up" : "down"}
          tooltip="Nest Egg Needed = Annual Retirement Expense ÷ Safe Withdrawal Rate (default 4%)\nReadiness % = Investments ÷ Nest Egg × 100"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Monthly Cash Flow – 24 Month View
              <InfoTooltip content="Blue area = income, red area = outflows (expenses + debt), green line = net leftover each month. Below ฿0 dashed line = deficit." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CashFlowTooltip />} />
                <Area type="monotone" dataKey="Income" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                <Area type="monotone" dataKey="Expenses" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                <Line type="monotone" dataKey="Net Flow" stroke="#10b981" strokeWidth={2} dot={false} />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Debt Payoff Timeline
              <InfoTooltip content="Amber = mortgage balance, red = other debts. Both areas decline to ฿0 as you pay off loans." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={debtChartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => thb(v)} />
                <Area type="monotone" dataKey="Mortgage" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                <Area type="monotone" dataKey="Other Debt" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Net Worth Projection (20 Years)
              <InfoTooltip content="Blue bars = investments (compound growth), red bars = debt (negative), green line = net worth = investments − debt." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={netWorthData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}K`} />
                <Tooltip formatter={(v: number) => `฿${v.toFixed(0)}K`} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Investments" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Debt" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="Net Worth" stroke="#10b981" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Monthly Expense Mix
              <InfoTooltip content="Each slice = category ÷ total monthly expenses. Yearly items are divided by 12 for monthly equivalent." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={expenseBreakdown} cx="50%" cy="50%" outerRadius={80}
                  dataKey="value" nameKey="name" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false} fontSize={10}>
                  {expenseBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => thb(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {expenseBreakdown.slice(0, 4).map((e, i) => (
                <div key={e.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-muted-foreground">{e.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{thb(e.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Mortgage summary + Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mortgage Card */}
        {mortgageSummary && mortgage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Home size={16} className="text-amber-600 dark:text-amber-400" />
                Mortgage Snapshot – {mortgage.propertyName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Outstanding", value: thb(mortgage.currentBalance) },
                  { label: "Monthly Payment", value: thb(mortgage.standardMonthlyPayment + mortgage.extraMonthlyPayment) },
                  { label: "Rate", value: pct(mortgage.annualInterestRate) },
                  { label: "Payoff Date", value: mortgageSummary.payoffDate },
                  { label: "Total Interest", value: thb(mortgageSummary.totalInterestPaid) },
                  { label: "Interest Saved", value: thb(mortgageSummary.interestSaved) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold text-sm tabular-nums mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
              {mortgageSummary.monthsSaved > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm">
                  <CheckCircle size={16} />
                  Extra payments save <strong>{mortgageSummary.monthsSaved} months</strong> & {thb(mortgageSummary.interestSaved)} in interest
                </div>
              )}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Paid off</span>
                  <span>{pct(1 - safeDivide(mortgage.currentBalance, mortgage.originalPrincipal))}</span>
                </div>
                <Progress
                  value={(1 - safeDivide(mortgage.currentBalance, mortgage.originalPrincipal)) * 100}
                  color="bg-amber-500"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Milestones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={16} className="text-blue-600 dark:text-blue-400" />
              Financial Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Run forecast to see milestones</p>
            ) : (
              <div className="space-y-2">
                {milestones.slice(0, 6).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <CheckCircle size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-xs text-muted-foreground">Year {m.year} · Age {m.age}</div>
                    </div>
                    <Badge variant="outline">{m.year}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
