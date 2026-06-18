"use client";
import { useState, useMemo } from "react";
import { useStore, selectTotalDebtBalance, selectTotalMonthlyDebtPayments, selectTotalMonthlyIncome } from "@/lib/store";
import { thb, pct, safeDivide } from "@/lib/utils";
import { summariseMortgage, compareExtraPaymentScenarios } from "@/lib/engine/mortgage";
import { calculatePayoffYear, formatPayoffDisplay, computePayoffMonths, computePayoffInfo } from "@/lib/engine/debt-payoff";
import type { DebtAccount, DebtType, Profile, PlannedPayment } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, NumberInput, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Progress, Alert, Tabs, TabsList, TabsTrigger, TabsContent,
  InfoTooltip
} from "@/components/ui";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart, Line, Legend,
} from "recharts";
import { Plus, Edit, Trash2, Home, CreditCard, Car, AlertTriangle, TrendingDown, CheckCircle, Check, Calendar, Flag } from "lucide-react";

const DEBT_TYPES: DebtType[] = ["mortgage", "credit-card", "personal-loan", "car-loan", "other"];
const DEBT_ICONS: Record<DebtType, any> = {
  mortgage: Home, "credit-card": CreditCard, "personal-loan": CreditCard, "car-loan": Car, other: CreditCard,
};
const DEBT_COLORS: Record<DebtType, string> = {
  mortgage: "#f59e0b", "credit-card": "#ef4444", "personal-loan": "#8b5cf6", "car-loan": "#3b82f6", other: "#6b7280",
};

function defaultDebt(): Omit<DebtAccount, "id"> {
  return {
    name: "", lender: "", debtType: "personal-loan", originalPrincipal: 0,
    currentBalance: 0, annualInterestRate: 0.07, interestType: "fixed",
    minimumMonthlyPayment: 0, standardMonthlyPayment: 0, extraMonthlyPayment: 0,
    startDate: new Date().toISOString().split("T")[0], notes: "", isActive: true,
    loanTermMonths: 60, plannedPayments: [],
  };
}

function DebtForm({ item, onChange }: { item: Omit<DebtAccount, "id">; onChange: (k: string, v: any) => void }) {
  const isMortgage = item.debtType === "mortgage";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Debt Name</Label>
        <Input value={item.name} onChange={e => onChange("name", e.target.value)} className="mt-1" placeholder="e.g. Home Mortgage" />
      </div>
      <div>
        <Label>Lender</Label>
        <Input value={item.lender} onChange={e => onChange("lender", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>Debt Type</Label>
        <Select value={item.debtType} onChange={e => onChange("debtType", e.target.value)} className="mt-1">
          {DEBT_TYPES.map(t => <option key={t} value={t}>{t.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </Select>
      </div>
      {isMortgage && (
        <div className="col-span-2">
          <Label>Property Name</Label>
          <Input value={item.propertyName ?? ""} onChange={e => onChange("propertyName", e.target.value)} className="mt-1" placeholder="e.g. Condo Sukhumvit 49" />
        </div>
      )}
      <div>
        <Label>Original Principal (฿)</Label>
        <NumberInput value={item.originalPrincipal} onChange={v => onChange("originalPrincipal", v)} className="mt-1" />
      </div>
      <div>
        <Label>Current Balance (฿)</Label>
        <NumberInput value={item.currentBalance} onChange={v => onChange("currentBalance", v)} className="mt-1" />
      </div>
      <div>
        <Label>Annual Interest Rate (%)</Label>
        <NumberInput step="0.1" value={parseFloat((item.annualInterestRate * 100).toFixed(2))}
          onChange={v => onChange("annualInterestRate", v / 100)} className="mt-1" />
      </div>
      <div>
        <Label>Interest Type</Label>
        <Select value={item.interestType} onChange={e => onChange("interestType", e.target.value)} className="mt-1">
          <option value="fixed">Fixed Rate</option>
          <option value="floating">Floating / Variable</option>
        </Select>
      </div>
      <div>
        <Label>Loan Term (months)</Label>
        <NumberInput value={item.loanTermMonths ?? 60} onChange={v => onChange("loanTermMonths", v)} className="mt-1" />
      </div>
      <div>
        <Label>Minimum Monthly Payment (฿)</Label>
        <NumberInput value={item.minimumMonthlyPayment} onChange={v => onChange("minimumMonthlyPayment", v)} className="mt-1" />
      </div>
      <div>
        <Label>Standard Monthly Payment (฿)</Label>
        <NumberInput value={item.standardMonthlyPayment} onChange={v => onChange("standardMonthlyPayment", v)} className="mt-1" />
      </div>
      <div>
        <Label>Extra Monthly Payment (฿)</Label>
        <NumberInput value={item.extraMonthlyPayment} onChange={v => onChange("extraMonthlyPayment", v)} className="mt-1" />
      </div>
      <div>
        <Label>Start Date</Label>
        <Input type="date" value={item.startDate} onChange={e => onChange("startDate", e.target.value)} className="mt-1" />
      </div>
      {isMortgage && (
        <>
          <div>
            <Label>Annual Lump-Sum Prepayment (฿)</Label>
            <NumberInput value={item.annualPrepayment ?? 0} onChange={v => onChange("annualPrepayment", v)} className="mt-1" />
          </div>
          <div>
            <Label>Planned Refinance Date</Label>
            <Input type="date" value={item.refinanceDate ?? ""} onChange={e => onChange("refinanceDate", e.target.value || undefined)} className="mt-1" />
          </div>
          <div>
            <Label>Refinance New Rate (%)</Label>
            <NumberInput step="0.1" value={item.refinanceNewRate ? parseFloat((item.refinanceNewRate * 100).toFixed(2)) : 0}
              onChange={v => onChange("refinanceNewRate", v > 0 ? v / 100 : undefined)} className="mt-1" />
          </div>
          <div>
            <Label>Refinance Fee (฿)</Label>
            <NumberInput value={item.refinanceFee ?? 0} onChange={v => onChange("refinanceFee", v)} className="mt-1" />
          </div>
          <div className="col-span-2">
            <div className="flex items-center gap-1.5">
              <Label>Planned Payment Schedule</Label>
              <InfoTooltip content="Set a total planned monthly payment (standard + extra combined) for a from-year to until-year range, e.g. 2027–2029. Toggle 'Until fully paid' to leave the range open-ended instead of picking an end year. Useful for step-up payback plans." />
            </div>
            <div className="mt-1 space-y-2">
              {(item.plannedPayments ?? []).map((p, idx) => {
                const list = item.plannedPayments ?? [];
                const untilPaidOff = p.endYear === undefined;
                const update = (patch: Partial<PlannedPayment>) => {
                  const next = list.map((row, i) => i === idx ? { ...row, ...patch } : row);
                  onChange("plannedPayments", next);
                };
                const remove = () => {
                  onChange("plannedPayments", list.filter((_, i) => i !== idx));
                };
                return (
                  <div key={idx} className="rounded-lg border border-border p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Label className="text-xs">From year</Label>
                        <NumberInput value={p.startYear} onChange={v => update({ startYear: v })} placeholder="Year" className="mt-0.5" />
                      </div>
                      <span className="text-xs text-muted-foreground mt-4">→</span>
                      <div className="w-24">
                        <Label className="text-xs">Until year</Label>
                        <NumberInput
                          value={p.endYear ?? p.startYear}
                          onChange={v => update({ endYear: v })}
                          placeholder="Year"
                          disabled={untilPaidOff}
                          className="mt-0.5"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Total monthly payment (฿)</Label>
                        <NumberInput value={p.monthlyPayment} onChange={v => update({ monthlyPayment: v })} placeholder="Monthly payment" className="mt-0.5" />
                      </div>
                      <button type="button" onClick={remove} className="p-1.5 hover:bg-destructive/10 rounded self-end">
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={untilPaidOff}
                        onCheckedChange={v => update({ endYear: v ? undefined : p.startYear })}
                      />
                      <Label className="text-xs">Until fully paid (no end year)</Label>
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const list = item.plannedPayments ?? [];
                  const nextYear = list.length > 0 ? Math.max(...list.map(p => p.endYear ?? p.startYear)) + 1 : new Date(item.startDate).getFullYear() + 1;
                  onChange("plannedPayments", [...list, { startYear: nextYear, endYear: undefined, monthlyPayment: item.standardMonthlyPayment + item.extraMonthlyPayment }]);
                }}
              >
                <Plus size={12} /> Add Planned Year
              </Button>
            </div>
          </div>
        </>
      )}
      <div className="flex items-center gap-3 mt-2">
        <Label>Active</Label>
        <Switch checked={item.isActive} onCheckedChange={v => onChange("isActive", v)} />
      </div>
      <div className="col-span-2">
        <Label>Notes</Label>
        <Textarea value={item.notes} onChange={e => onChange("notes", e.target.value)} className="mt-1" />
      </div>
    </div>
  );
}

function MortgageSimulatorPanel({ debts, selectedDebtIds }: { debts: DebtAccount[]; selectedDebtIds: Set<string> }) {
  // Find the first selected mortgage; if none selected, show placeholder
  const selectedMortgage = debts.find(d => selectedDebtIds.has(d.id) && d.debtType === "mortgage" && d.isActive);

  // Early return: no mortgage selected
  if (!selectedMortgage) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Flag size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Tick a mortgage above to run the simulation</p>
        </CardContent>
      </Card>
    );
  }

  const [extraPayment, setExtraPayment] = useState(selectedMortgage.extraMonthlyPayment);
  const [lumpSum, setLumpSum] = useState(selectedMortgage.annualPrepayment ?? 0);
  const [rateOverride, setRateOverride] = useState(selectedMortgage.annualInterestRate * 100);
  const [tab, setTab] = useState("chart");

  const mortgage = selectedMortgage;

  const baseParams = {
    openingBalance: mortgage.currentBalance,
    annualRate: rateOverride / 100,
    termMonths: mortgage.loanTermMonths ?? 360,
    standardMonthlyPayment: mortgage.standardMonthlyPayment,
    extraMonthlyPayment: extraPayment,
    annualLumpSum: lumpSum,
    startDate: mortgage.startDate,
    refinanceDate: mortgage.refinanceDate,
    refinanceNewRate: mortgage.refinanceNewRate,
    refinanceFee: mortgage.refinanceFee,
    plannedPayments: mortgage.plannedPayments,
  };

  const summary = useMemo(() => summariseMortgage(baseParams), [extraPayment, lumpSum, rateOverride]);

  const scenarios = useMemo(() =>
    compareExtraPaymentScenarios({ ...baseParams, extraMonthlyPayment: 0 }, [0, 5000, 10000, 15000, 20000, 30000]),
    [lumpSum, rateOverride]);

  // Chart data: quarterly snapshots of balance
  const chartData = summary.schedule
    .filter((_, i) => i % 3 === 0)
    .map(r => ({
      month: `${r.calendarYear}`,
      Balance: Math.round(r.closingBalance),
      Interest: Math.round(r.interestPaid),
      Principal: Math.round(r.principalPaid),
    }));

  const monthlyInterest = (mortgage.currentBalance * (rateOverride / 100)) / 12;
  const totalPayment = mortgage.standardMonthlyPayment + extraPayment;
  const isPayingBelowInterest = totalPayment < monthlyInterest;

  return (
    <div className="space-y-4">
      {isPayingBelowInterest && (
        <Alert variant="danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span className="font-medium">Warning: Payment below monthly interest accrual</span>
          </div>
          <p className="text-xs mt-1">Monthly interest: {thb(monthlyInterest)} | Your payment: {thb(totalPayment)}. The loan balance is growing!</p>
        </Alert>
      )}

      {/* Controls */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Simulation Controls</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Extra Monthly Payment (฿)</Label>
            <NumberInput step={1000} value={extraPayment} onChange={v => setExtraPayment(v)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Annual Lump Sum (฿)</Label>
            <NumberInput step={10000} value={lumpSum} onChange={v => setLumpSum(v)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Interest Rate (%)</Label>
            <NumberInput step={0.1} value={parseFloat(rateOverride.toFixed(2))} onChange={v => setRateOverride(v)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {mortgage.plannedPayments && mortgage.plannedPayments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Planned Payment Schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[...mortgage.plannedPayments].sort((a, b) => a.startYear - b.startYear).map((p, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {p.startYear}–{p.endYear ?? "paid off"}: {thb(p.monthlyPayment)}/mo
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Each amount replaces the standard + extra payment from that year onward (until the next planned year), and is synced into the Forecast page automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Payoff Date", value: summary.payoffDate, color: "text-primary" },
          { label: "Total Interest", value: thb(summary.totalInterestPaid), color: "text-red-600" },
          { label: "Interest Saved", value: thb(summary.interestSaved), color: "text-emerald-600" },
          { label: "Months Saved", value: `${summary.monthsSaved} months`, color: "text-emerald-600" },
          { label: "Monthly Payment", value: thb(mortgage.standardMonthlyPayment + extraPayment), color: "" },
          { label: "Monthly Interest", value: thb(monthlyInterest), color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`font-bold text-sm tabular-nums mt-0.5 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="chart">Balance Chart</TabsTrigger>
          <TabsTrigger value="scenarios">Extra Payment Scenarios</TabsTrigger>
          <TabsTrigger value="schedule">Amortization Table</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={7} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => thb(v)} />
                  <Area type="monotone" dataKey="Balance" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Outstanding Balance" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scenarios">
          <Card>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["Extra/Month", "Payoff Date", "Months Saved", "Total Interest", "Interest Saved"].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, i) => (
                      <tr key={i} className={`border-b border-border hover:bg-muted/30 ${s.extraMonthly === extraPayment ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3 font-medium">
                          {thb(s.extraMonthly)}
                          {s.extraMonthly === extraPayment && <Badge variant="default" className="ml-2 text-xs">Current</Badge>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{s.payoffDate}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-600 font-medium">
                          {s.monthsSaved > 0 ? `-${s.monthsSaved} mo` : "–"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{thb(s.totalInterest)}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-600 font-medium">
                          {s.interestSaved > 0 ? `+${thb(s.interestSaved)}` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardContent className="pt-4">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border bg-muted/50">
                      {["Month", "Year", "Payment", "Principal", "Interest", "Extra", "Balance", "Cum. Interest"].map(h => (
                        <th key={h} className="text-right px-3 py-2 font-medium text-muted-foreground first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.schedule.slice(0, 120).map(row => (
                      <tr key={row.month} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground">{row.month}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.calendarYear}/{String(row.calendarMonth).padStart(2,"0")}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{thb(row.scheduledPayment)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{thb(row.principalPaid - row.extraPrincipal)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-red-500">{thb(row.interestPaid)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-blue-600">{row.extraPrincipal > 0 ? thb(row.extraPrincipal) : "–"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{thb(row.closingBalance)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{thb(row.cumulativeInterest)}</td>
                      </tr>
                    ))}
                    {summary.schedule.length > 120 && (
                      <tr><td colSpan={8} className="px-3 py-2 text-center text-xs text-muted-foreground">Showing 120 of {summary.schedule.length} months</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DebtsPage() {
  const { debts, addDebt, updateDebt, deleteDebt, profile } = useStore();
  const store = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<DebtAccount, "id">>(defaultDebt());
  const [mainTab, setMainTab] = useState("overview");
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(new Set());

  const monthlyIncome = selectTotalMonthlyIncome(store);

  // Precompute payoff info for all debts to avoid hooks in map
  const payoffInfoMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePayoffInfo>>();
    debts.forEach(debt => {
      map.set(debt.id, computePayoffInfo(debt, profile));
    });
    return map;
  }, [debts, profile]);

  const selectedDebts = useMemo(() => {
    const activeDebts = debts.filter(d => d.isActive);
    const filtered = selectedDebtIds.size > 0 ? activeDebts.filter(d => selectedDebtIds.has(d.id)) : activeDebts;

    const balance = filtered.reduce((sum, d) => sum + d.currentBalance, 0);
    const payments = filtered.reduce((sum, d) => sum + (d.standardMonthlyPayment + d.extraMonthlyPayment), 0);
    const dti = safeDivide(balance, monthlyIncome * 12);
    const dsr = safeDivide(payments, monthlyIncome);

    return {
      balance,
      payments,
      dti,
      dsr,
      count: filtered.length,
      totalCount: activeDebts.length
    };
  }, [debts, selectedDebtIds, monthlyIncome]);

  const totalDebt = selectedDebts.balance;
  const monthlyPayments = selectedDebts.payments;
  const dti = selectedDebts.dti;
  const dsr = selectedDebts.dsr;

  const openAdd = () => { setFormData(defaultDebt()); setEditId(null); setModalOpen(true); };
  const openEdit = (item: DebtAccount) => { setFormData({ ...item }); setEditId(item.id); setModalOpen(true); };
  const handleSave = () => {
    if (!formData.name || formData.currentBalance < 0) return;
    if (editId) updateDebt(editId, formData);
    else addDebt(formData);
    setModalOpen(false);
  };
  const handleDelete = (id: string) => { if (confirm("Delete this debt account?")) deleteDebt(id); };
  const setField = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));


  const subtitle = selectedDebts.count > 0 && selectedDebts.count < selectedDebts.totalCount
    ? `Showing ${selectedDebts.count} of ${selectedDebts.totalCount} debts`
    : "Manage all debts with payoff simulation and amortization analysis";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Debts & Mortgage"
        subtitle={subtitle}
        actions={<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Debt</Button>}
      />

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Total Debt"
          value={thb(totalDebt)}
          icon={CreditCard}
          color="red"
          tooltip="Σ currentBalance for all active debt accounts."
        />
        <StatCard
          title="Monthly Payments"
          value={thb(monthlyPayments)}
          icon={TrendingDown}
          color="amber"
          tooltip="Σ (standardMonthlyPayment + extraMonthlyPayment) across all active debts.\nDSR = this ÷ monthly income"
        />
        <StatCard
          title="Debt-to-Income"
          value={pct(dti)}
          subtitle={dti < 0.3 ? "Good (<30%)" : dti < 0.4 ? "Moderate" : "High (>40%)"}
          icon={AlertTriangle}
          color={dti < 0.3 ? "green" : dti < 0.4 ? "amber" : "red"}
          tooltip="= Total Debt ÷ (Monthly Income × 12)\nSafe <25% · Caution 25–40% · High >40%"
        />
        <StatCard
          title="Debt Service Ratio"
          value={pct(dsr)}
          subtitle={dsr < 0.35 ? "Manageable (<35%)" : "Review needed"}
          icon={AlertTriangle}
          color={dsr < 0.35 ? "green" : "red"}
          tooltip="= Monthly Payments ÷ Monthly Income\nThai banks: <35% safe, >40% rejection risk"
        />
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Debt Overview</TabsTrigger>
          {debts.some(d => d.debtType === "mortgage" && d.isActive) && <TabsTrigger value="simulator">Mortgage Simulator</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          {/* Debt Selection & Cards */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all-debts"
              checked={selectedDebtIds.size === debts.filter(d => d.isActive).length && debts.filter(d => d.isActive).length > 0}
              onChange={e => {
                if (e.target.checked) {
                  setSelectedDebtIds(new Set(debts.filter(d => d.isActive).map(d => d.id)));
                } else {
                  setSelectedDebtIds(new Set());
                }
              }}
              className="cursor-pointer"
            />
            <label htmlFor="select-all-debts" className="text-sm font-medium cursor-pointer">
              Select All Debts for Simulation
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {debts.filter(d => d.isActive).map(debt => {
              const Icon = DEBT_ICONS[debt.debtType];
              const paidOff = (1 - safeDivide(debt.currentBalance, debt.originalPrincipal)) * 100;
              const monthlyInterest = (debt.currentBalance * debt.annualInterestRate) / 12;
              const totalPayment = debt.standardMonthlyPayment + debt.extraMonthlyPayment;
              const payoffMetrics = calculatePayoffYear(debt.currentBalance, totalPayment, new Date().getFullYear());
              const isSelected = selectedDebtIds.has(debt.id);
              const payoffInfo = payoffInfoMap.get(debt.id) || { label: "N/A", age: null, date: null, status: "on-track" as const };

              return (
                <Card key={debt.id} className={`hover:shadow-md transition-shadow cursor-pointer border-2 ${isSelected ? "border-primary bg-primary/5" : "border-transparent"}`}
                  onClick={(e) => {
                    // Early return if clicking on input element to prevent double-toggle
                    if ((e.target as HTMLElement).tagName === "INPUT") {
                      return;
                    }
                    const newSelected = new Set(selectedDebtIds);
                    if (isSelected) {
                      newSelected.delete(debt.id);
                    } else {
                      newSelected.add(debt.id);
                    }
                    setSelectedDebtIds(newSelected);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newSet = new Set(selectedDebtIds);
                            if (e.target.checked) {
                              newSet.add(debt.id);
                            } else {
                              newSet.delete(debt.id);
                            }
                            setSelectedDebtIds(newSet);
                          }}
                          className="cursor-pointer"
                        />
                        <div className="p-2 rounded-lg" style={{ background: DEBT_COLORS[debt.debtType] + "20" }}>
                          <Icon size={16} style={{ color: DEBT_COLORS[debt.debtType] }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm leading-tight">{debt.name}</div>
                            {debt.debtType === "mortgage" && payoffInfo.status === "on-track" && payoffInfo.age !== null && (
                              <Badge variant="outline" className="text-xs">Completes at {payoffInfo.age}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{debt.lender}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(debt); }} className="p-1 hover:bg-accent rounded"><Edit size={13} className="text-muted-foreground" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(debt.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 size={13} className="text-destructive" /></button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-bold tabular-nums">{thb(debt.currentBalance)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Monthly payment</span>
                        <span>{thb(totalPayment)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Rate</span>
                        <span>{pct(debt.annualInterestRate)} ({debt.interestType})</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Monthly interest</span>
                        <span className="text-amber-600">{thb(monthlyInterest)}</span>
                      </div>
                      <div className="flex justify-between text-xs px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 mt-2">
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {formatPayoffDisplay(payoffMetrics.payoffYear)}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-300 text-xs">
                          {payoffMetrics.monthsRemaining} months
                        </span>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs mt-2 px-2 py-1 rounded-md ${
                        payoffInfo.status === "done" ? "text-emerald-600 dark:text-emerald-400" :
                        payoffInfo.status === "stalled" ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {payoffInfo.status === "done" ? <CheckCircle size={12} /> : <Calendar size={12} />}
                        <span>{payoffInfo.label}</span>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Paid off</span>
                          <span>{paidOff.toFixed(1)}%</span>
                        </div>
                        <Progress value={paidOff} color={
                          debt.debtType === "mortgage" ? "bg-amber-500" :
                          debt.debtType === "credit-card" ? "bg-red-500" : "bg-blue-500"
                        } />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <Card className="border-dashed hover:bg-muted/20 cursor-pointer" onClick={openAdd}>
              <CardContent className="flex flex-col items-center justify-center h-full py-8 gap-2">
                <Plus size={20} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Add Debt</span>
              </CardContent>
            </Card>
          </div>

          {/* Debt strategy comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Debt Payoff Strategy Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["Debt", "Balance", "Rate", "Min Payment", "Monthly Interest", "Priority (Avalanche)"].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {debts.filter(d => d.isActive)
                      .sort((a, b) => b.annualInterestRate - a.annualInterestRate)
                      .map((debt, i) => (
                        <tr key={debt.id} className="border-b border-border hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="font-medium">{debt.name}</div>
                            <Badge variant="outline" className="mt-0.5 text-xs">{debt.debtType}</Badge>
                          </td>
                          <td className="px-4 py-3 tabular-nums">{thb(debt.currentBalance)}</td>
                          <td className="px-4 py-3 tabular-nums font-medium" style={{ color: debt.annualInterestRate > 0.1 ? "#ef4444" : "#3b82f6" }}>
                            {pct(debt.annualInterestRate)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{thb(debt.minimumMonthlyPayment)}</td>
                          <td className="px-4 py-3 tabular-nums text-amber-600">{thb((debt.currentBalance * debt.annualInterestRate) / 12)}</td>
                          <td className="px-4 py-3">
                            {i === 0 ? (
                              <Badge variant="danger">Attack First (Highest Rate)</Badge>
                            ) : i === 1 ? (
                              <Badge variant="warning">Next Priority</Badge>
                            ) : (
                              <Badge variant="outline">Minimum Payments</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-200">
                <strong>Avalanche Method:</strong> Pay minimums on all debts, put extra cash toward the highest-rate debt first. This minimises total interest paid.
                <br />
                <strong>Snowball Method:</strong> Pay minimums on all debts, put extra cash toward the smallest balance first. This builds momentum through quick wins.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {debts.some(d => d.debtType === "mortgage" && d.isActive) && (
          <TabsContent value="simulator">
            <MortgageSimulatorPanel debts={debts} selectedDebtIds={selectedDebtIds} />
          </TabsContent>
        )}
      </Tabs>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Debt" : "Add Debt"} className="max-w-2xl">
        <DebtForm item={formData} onChange={setField} />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
