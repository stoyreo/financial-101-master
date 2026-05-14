"use client";
import { useState, useCallback } from "react";
import { useStore, selectTotalInvestmentValue } from "@/lib/store";
import { thb, pct, calcAge } from "@/lib/utils";
import type { InvestmentAccount, AccountType } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Progress,
  InfoTooltip
} from "@/components/ui";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Plus, Edit, Trash2, PiggyBank, TrendingUp } from "lucide-react";
import { ScenarioSimulator } from "./_components/ScenarioSimulator";
import { PVDForecastCard } from "./_components/PVDForecastCard";

const ACCOUNT_TYPES: AccountType[] = ["PVD", "RMF", "SSF", "SSO", "brokerage", "savings", "crypto", "other"];
const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16"];
const TYPE_LABELS: Record<AccountType, string> = {
  PVD: "PVD (Provident Fund)", RMF: "RMF", SSF: "SSF", SSO: "SSO",
  brokerage: "Brokerage", savings: "Savings", crypto: "Crypto", other: "Other",
};

// Default expected returns per account type — PVD is overridden by AI forecast
const DEFAULT_RETURNS: Record<AccountType, number> = {
  PVD: 0.04,       // placeholder; replaced by AI forecast on form open
  RMF: 0.07,
  SSF: 0.07,
  SSO: 0.03,
  brokerage: 0.08,
  savings: 0.015,
  crypto: 0.15,
  other: 0.05,
};

function defaultInvestment(): Omit<InvestmentAccount, "id"> {
  return {
    name: "", accountType: "brokerage", assetDescription: "",
    marketValue: 0, currency: "THB", isTaxAdvantaged: false,
    expectedAnnualReturn: DEFAULT_RETURNS["brokerage"],
    monthlyContribution: 0,
    annualContribution: 0, owner: "Me", notes: "", isActive: true,
  };
}

function InvestmentForm({
  item,
  onChange,
  aiPVDReturn,
}: {
  item: Omit<InvestmentAccount, "id">;
  onChange: (k: string, v: any) => void;
  aiPVDReturn?: number;
}) {
  const isPVD = item.accountType === "PVD";

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Account Name</Label>
        <Input value={item.name} onChange={e => onChange("name", e.target.value)} className="mt-1" placeholder="e.g. SCB Masterplan PVD" />
      </div>
      <div>
        <Label>Account Type</Label>
        <Select value={item.accountType} onChange={e => {
          const t = e.target.value as AccountType;
          onChange("accountType", t);
          // Auto-populate return when switching to PVD
          if (t === "PVD" && aiPVDReturn !== undefined) {
            onChange("expectedAnnualReturn", aiPVDReturn);
          } else if (t !== "PVD") {
            onChange("expectedAnnualReturn", DEFAULT_RETURNS[t] ?? 0.05);
          }
        }} className="mt-1">
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </Select>
      </div>
      <div>
        <Label>Owner</Label>
        <Input value={item.owner} onChange={e => onChange("owner", e.target.value)} className="mt-1" />
      </div>
      <div className="col-span-2">
        <Label>Asset Description</Label>
        <Input value={item.assetDescription} onChange={e => onChange("assetDescription", e.target.value)} className="mt-1"
          placeholder={isPVD ? "PVDMPFEQ — SCB SET Index Policy" : "e.g. Thai equity fund, 60/40 mix"} />
      </div>
      <div>
        <Label>Current Market Value (฿)</Label>
        <Input type="number" value={item.marketValue} onChange={e => onChange("marketValue", Number(e.target.value))} className="mt-1" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Label className="mb-0">Expected Annual Return (%)</Label>
          {isPVD && aiPVDReturn !== undefined && (
            <span className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
              ✦ AI: {pct(aiPVDReturn)}
            </span>
          )}
        </div>
        <Input type="number" step="0.5" value={(item.expectedAnnualReturn * 100).toFixed(1)}
          onChange={e => onChange("expectedAnnualReturn", Number(e.target.value) / 100)} className="mt-1" />
        {isPVD && aiPVDReturn !== undefined && Math.abs(item.expectedAnnualReturn - aiPVDReturn) > 0.001 && (
          <button
            type="button"
            onClick={() => onChange("expectedAnnualReturn", aiPVDReturn)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1"
          >
            Reset to AI estimate ({pct(aiPVDReturn)})
          </button>
        )}
      </div>
      <div>
        <Label>Monthly Contribution (฿)</Label>
        <Input type="number" value={item.monthlyContribution} onChange={e => onChange("monthlyContribution", Number(e.target.value))} className="mt-1" />
      </div>
      <div>
        <Label>Annual Contribution (฿)</Label>
        <Input type="number" value={item.annualContribution} onChange={e => onChange("annualContribution", Number(e.target.value))} className="mt-1" />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Label>Tax Advantaged</Label>
        <Switch checked={item.isTaxAdvantaged} onCheckedChange={v => onChange("isTaxAdvantaged", v)} />
      </div>
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

export default function InvestmentsPage() {
  const { investments, retirement, profile, addInvestment, updateInvestment, deleteInvestment } = useStore();
  const store = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<InvestmentAccount, "id">>(defaultInvestment());

  // AI PVD forecast state — loaded by PVDForecastCard, shared with the form
  const [aiPVDReturn, setAiPVDReturn] = useState<number | undefined>(undefined);

  // Apply AI forecast to all active PVD accounts
  const handleApplyAIForecast = useCallback((estimatedReturn: number) => {
    setAiPVDReturn(estimatedReturn);
    investments
      .filter(inv => inv.isActive && inv.accountType === "PVD")
      .forEach(inv => updateInvestment(inv.id, { expectedAnnualReturn: estimatedReturn }));
  }, [investments, updateInvestment]);

  const totalValue = selectTotalInvestmentValue(store);
  const taxAdvantaged = investments.filter(i => i.isActive && i.isTaxAdvantaged).reduce((s, i) => s + i.marketValue, 0);
  const monthlyContribs = investments.filter(i => i.isActive).reduce((s, i) => s + i.monthlyContribution + i.annualContribution / 12, 0);
  const weightedReturn = totalValue > 0
    ? investments.filter(i => i.isActive).reduce((s, i) => s + i.expectedAnnualReturn * i.marketValue, 0) / totalValue
    : 0;

  const openAdd = () => {
    const base = defaultInvestment();
    setFormData(base);
    setEditId(null);
    setModalOpen(true);
  };
  const openEdit = (item: InvestmentAccount) => { setFormData({ ...item }); setEditId(item.id); setModalOpen(true); };
  const handleSave = () => {
    if (!formData.name) return;
    if (editId) updateInvestment(editId, formData);
    else addInvestment(formData);
    setModalOpen(false);
  };
  const handleDelete = (id: string) => { if (confirm("Delete this investment account?")) deleteInvestment(id); };
  const setField = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

  // Projection: compound growth per account for 20 years (stacked by account)
  const activeInvestments = investments.filter(i => i.isActive);
  const projectionData = Array.from({ length: 21 }, (_, yr) => {
    const row: Record<string, any> = { year: new Date().getFullYear() + yr };
    let total = 0;
    activeInvestments.forEach((inv, i) => {
      const contrib = inv.monthlyContribution * 12 + inv.annualContribution;
      const r = inv.expectedAnnualReturn;
      const projected = inv.marketValue * Math.pow(1 + r, yr)
        + (r > 0 ? contrib * (Math.pow(1 + r, yr) - 1) / r : contrib * yr);
      const value = Math.round(projected);
      row[inv.name] = value;
      total += value;
    });
    row._total = total;
    return row;
  });

  const pieData = investments.filter(i => i.isActive).map(i => ({ name: i.name, value: i.marketValue }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Investments"
        subtitle="Track PVD, RMF, stocks, savings, and all investment accounts"
        actions={<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>}
      />

      {/* ── PVD AI Forecast ───────────────────────────────────────────────────── */}
      <PVDForecastCard
        onApply={handleApplyAIForecast}
        hasPVDAccounts={investments.some(i => i.isActive && i.accountType === "PVD")}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Total Portfolio"
          value={thb(totalValue)}
          icon={PiggyBank}
          color="blue"
          tooltip="Σ marketValue for all active accounts."
        />
        <StatCard
          title="Tax-Advantaged"
          value={thb(taxAdvantaged)}
          subtitle={pct(taxAdvantaged / (totalValue || 1))}
          icon={PiggyBank}
          color="green"
          tooltip="PVD (≤15% income), RMF (≤30% income, max ฿500K), SSF (≤30% income, max ฿200K).\nContributions reduce taxable income."
        />
        <StatCard
          title="Monthly Contributions"
          value={thb(monthlyContribs)}
          icon={TrendingUp}
          color="amber"
          tooltip="Σ (monthlyContribution + annualContribution ÷ 12) across all active accounts."
        />
        <StatCard
          title="Weighted Return"
          value={pct(weightedReturn)}
          icon={TrendingUp}
          color="purple"
          tooltip="= Σ(account return × account value) ÷ Σ(account value)\nLarger accounts pull the weighted average toward their rate."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Portfolio Composition</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => thb(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {investments.filter(i => i.isActive).map((inv, i) => (
                <div key={inv.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground truncate max-w-24">{inv.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{thb(inv.marketValue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">20-Year Growth Projection</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projectionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs">
                        <div className="font-semibold text-foreground mb-1.5">{label}</div>
                        <div className="font-bold text-foreground mb-1">Total: {thb(total)}</div>
                        <div className="space-y-0.5">
                          {payload.reverse().map((p, i) => (
                            <div key={i} className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                <span className="text-muted-foreground truncate max-w-28">{p.dataKey}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium tabular-nums">{thb(Number(p.value))}</span>
                                <span className="text-muted-foreground tabular-nums w-10 text-right">
                                  {total > 0 ? `${((Number(p.value) / total) * 100).toFixed(0)}%` : "0%"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                {activeInvestments.map((inv, i) => (
                  <Bar
                    key={inv.id}
                    dataKey={inv.name}
                    stackId="portfolio"
                    fill={COLORS[i % COLORS.length]}
                    radius={i === activeInvestments.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 mb-1">
              {activeInvestments.map((inv, i) => (
                <div key={inv.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate max-w-28">{inv.name}</span>
                </div>
              ))}
            </div>
            <div className="p-2 bg-muted rounded-lg text-xs text-muted-foreground">
              Projection assumes constant contributions and expected returns per account. Does not adjust for inflation.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retirement gauge */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Retirement Readiness</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Current Portfolio", value: thb(totalValue) },
              { label: "Target at Retirement", value: thb(retirement.expectedAnnualExpense / retirement.safeWithdrawalRate) },
              { label: "Safe Withdrawal Rate", value: pct(retirement.safeWithdrawalRate) },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Progress to Retirement Goal</span>
              <span className="font-medium">{Math.min(100, (totalValue / (retirement.expectedAnnualExpense / retirement.safeWithdrawalRate) * 100)).toFixed(1)}%</span>
            </div>
            <Progress
              value={Math.min(100, totalValue / (retirement.expectedAnnualExpense / retirement.safeWithdrawalRate) * 100)}
              color="bg-emerald-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── What-If Simulator ─────────────────────────────────────────────── */}
      <ScenarioSimulator
        investments={investments}
        retirementTarget={retirement.expectedAnnualExpense / retirement.safeWithdrawalRate}
        userAge={calcAge(profile.dateOfBirth)}
        retirementYear={
          profile.dateOfBirth
            ? new Date(profile.dateOfBirth).getFullYear() + retirement.retirementAge
            : undefined
        }
        riskProfile={profile.riskProfile}
      />

      {/* Account table */}
      <Card className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Account", "Type", "Value", "Monthly Contrib", "Exp. Return", "Tax Adv.", "Status", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => (
                <tr key={inv.id} className="border-b border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{inv.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-48">{inv.assetDescription}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant={inv.isTaxAdvantaged ? "success" : "outline"}>{inv.accountType}</Badge></td>
                  <td className="px-4 py-3 font-bold tabular-nums">{thb(inv.marketValue)}</td>
                  <td className="px-4 py-3 tabular-nums">{thb(inv.monthlyContribution + inv.annualContribution / 12)}</td>
                  <td className="px-4 py-3 tabular-nums">{pct(inv.expectedAnnualReturn)}</td>
                  <td className="px-4 py-3"><Badge variant={inv.isTaxAdvantaged ? "success" : "outline"}>{inv.isTaxAdvantaged ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={inv.isActive ? "success" : "outline"}>{inv.isActive ? "Active" : "Off"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-accent rounded-md"><Edit size={13} className="text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(inv.id)} className="p-1.5 hover:bg-destructive/10 rounded-md"><Trash2 size={13} className="text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={2} className="px-4 py-3 font-semibold">TOTAL</td>
                <td className="px-4 py-3 font-bold tabular-nums">{thb(totalValue)}</td>
                <td className="px-4 py-3 tabular-nums">{thb(monthlyContribs)}/mo</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Investment Account" : "Add Investment Account"} className="max-w-2xl">
        <InvestmentForm item={formData} onChange={setField} aiPVDReturn={aiPVDReturn} />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
