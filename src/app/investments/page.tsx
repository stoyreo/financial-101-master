"use client";
import { useState, useCallback, useMemo } from "react";
import { useStore, selectTotalInvestmentValue } from "@/lib/store";
import { getSession } from "@/lib/auth-client";
import { thb, pct, calcAge } from "@/lib/utils";
import type { InvestmentAccount, AccountType } from "@/lib/types";
import {
  getAllFunds, addCustomFund, type FundInfo, type CustomFundInput,
} from "@/lib/fund-registry";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, NumberInput, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Progress,
  InfoTooltip
} from "@/components/ui";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Plus, Edit, Trash2, PiggyBank, TrendingUp } from "lucide-react";
import { ScenarioSimulator } from "./_components/ScenarioSimulator";
import { FundForecastCard } from "./_components/FundForecastCard";
import { AIRecommendationCard } from "./_components/AIRecommendationCard";
import { DCASimulatorCard } from "./_components/DCASimulatorCard";
import { ShortTermAIRadar } from "./_components/ShortTermAIRadar";
import { WatchlistCard } from "./_components/WatchlistCard";
import { ScorecardCard } from "./_components/ScorecardCard";

const ACCOUNT_TYPES: AccountType[] = ["PVD", "RMF", "SSF", "SSO", "brokerage", "savings", "crypto", "other"];
const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16"];
const TYPE_LABELS: Record<AccountType, string> = {
  PVD: "PVD (Provident Fund)", RMF: "RMF", SSF: "SSF", SSO: "SSO",
  brokerage: "Brokerage", savings: "Savings", crypto: "Crypto", other: "Other",
};

// Default expected returns per account type — overridden by AI forecast when
// the account is linked to a specific fund via fundCode.
const DEFAULT_RETURNS: Record<AccountType, number> = {
  PVD: 0.04,       // placeholder; replaced by AI forecast once a fund is linked
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
    fundCode: undefined,
  };
}

function InvestmentForm({
  item,
  onChange,
  funds,
  aiReturnByFundCode,
  onAddFund,
}: {
  item: Omit<InvestmentAccount, "id">;
  onChange: (k: string, v: any) => void;
  funds: FundInfo[];
  aiReturnByFundCode: Record<string, number>;
  onAddFund: (input: CustomFundInput) => string;
}) {
  const [showAddFund, setShowAddFund] = useState(false);
  const [newFund, setNewFund] = useState<CustomFundInput>({ code: "", nameEN: "", fundType: "other", assetClass: "other" });

  const linkedFund = item.fundCode ? funds.find(f => f.code === item.fundCode) : undefined;
  const aiReturn = item.fundCode ? aiReturnByFundCode[item.fundCode] : undefined;

  // Only offer funds whose fundType roughly matches the selected AccountType,
  // plus always show every fund so users aren't blocked by a mismatch.
  const relevantFunds = funds.filter(f => f.fundType === item.accountType);
  const otherFunds = funds.filter(f => f.fundType !== item.accountType);

  const handleSubmitNewFund = () => {
    if (!newFund.code.trim() || !newFund.nameEN.trim()) return;
    const code = onAddFund(newFund);
    onChange("fundCode", code);
    setShowAddFund(false);
    setNewFund({ code: "", nameEN: "", fundType: "other", assetClass: "other" });
  };

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
          onChange("expectedAnnualReturn", DEFAULT_RETURNS[t] ?? 0.05);
        }} className="mt-1">
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </Select>
      </div>
      <div>
        <Label>Owner</Label>
        <Input value={item.owner} onChange={e => onChange("owner", e.target.value)} className="mt-1" />
      </div>

      <div className="col-span-2">
        <Label>Linked Fund (optional)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Select
            value={item.fundCode || ""}
            onChange={e => {
              const code = e.target.value;
              onChange("fundCode", code || undefined);
              if (code && aiReturnByFundCode[code] !== undefined) {
                onChange("expectedAnnualReturn", aiReturnByFundCode[code]);
              }
            }}
            className="flex-1"
          >
            <option value="">No specific fund (free-text description only)</option>
            {relevantFunds.length > 0 && (
              <optgroup label={`${TYPE_LABELS[item.accountType]} funds`}>
                {relevantFunds.map(f => <option key={f.code} value={f.code}>{f.code} — {f.nameEN}</option>)}
              </optgroup>
            )}
            {otherFunds.length > 0 && (
              <optgroup label="Other registered funds">
                {otherFunds.map(f => <option key={f.code} value={f.code}>{f.code} — {f.nameEN}</option>)}
              </optgroup>
            )}
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAddFund(s => !s)}>
            <Plus size={13} /> New fund
          </Button>
        </div>
        {linkedFund && aiReturn !== undefined && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
            ✦ AI estimate available for {linkedFund.code}: {pct(aiReturn)}
          </p>
        )}

        {showAddFund && (
          <div className="mt-2 p-3 border border-border rounded-lg grid grid-cols-2 gap-2 bg-muted/30">
            <div>
              <Label>Fund Code</Label>
              <Input value={newFund.code} onChange={e => setNewFund(f => ({ ...f, code: e.target.value }))} className="mt-1" placeholder="e.g. KFGOLD" />
            </div>
            <div>
              <Label>Fund Type</Label>
              <Select value={newFund.fundType} onChange={e => setNewFund(f => ({ ...f, fundType: e.target.value as CustomFundInput["fundType"] }))} className="mt-1">
                <option value="PVD">PVD</option>
                <option value="RMF">RMF</option>
                <option value="SSF">SSF</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Fund Name</Label>
              <Input value={newFund.nameEN} onChange={e => setNewFund(f => ({ ...f, nameEN: e.target.value }))} className="mt-1" placeholder="e.g. K-GOLD Fund" />
            </div>
            <div>
              <Label>Asset Class</Label>
              <Select value={newFund.assetClass} onChange={e => setNewFund(f => ({ ...f, assetClass: e.target.value as CustomFundInput["assetClass"] }))} className="mt-1">
                <option value="thai_equity">Thai Equity</option>
                <option value="gold">Gold</option>
                <option value="bond">Bond</option>
                <option value="mixed">Mixed</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label>Manager (optional)</Label>
              <Input value={newFund.manager || ""} onChange={e => setNewFund(f => ({ ...f, manager: e.target.value }))} className="mt-1" />
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowAddFund(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSubmitNewFund} disabled={!newFund.code.trim() || !newFund.nameEN.trim()}>Add fund</Button>
            </div>
          </div>
        )}
      </div>

      <div className="col-span-2">
        <Label>Asset Description</Label>
        <Input
          value={item.assetDescription}
          onChange={e => onChange("assetDescription", e.target.value)}
          className="mt-1"
          placeholder={linkedFund ? linkedFund.nameEN : "e.g. Thai equity fund, 60/40 mix"}
        />
      </div>
      <div>
        <Label>Current Market Value (฿)</Label>
        <NumberInput value={item.marketValue} onChange={v => onChange("marketValue", v)} className="mt-1" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Label className="mb-0">Expected Annual Return (%)</Label>
        </div>
        <NumberInput step="0.5" value={parseFloat((item.expectedAnnualReturn * 100).toFixed(1))}
          onChange={v => onChange("expectedAnnualReturn", v / 100)} className="mt-1" />
        {aiReturn !== undefined && Math.abs(item.expectedAnnualReturn - aiReturn) > 0.001 && (
          <button
            type="button"
            onClick={() => onChange("expectedAnnualReturn", aiReturn)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1"
          >
            Reset to AI estimate ({pct(aiReturn)})
          </button>
        )}
      </div>
      <div>
        <Label>Monthly Contribution (฿)</Label>
        <NumberInput value={item.monthlyContribution} onChange={v => onChange("monthlyContribution", v)} className="mt-1" />
      </div>
      <div>
        <Label>Annual Contribution (฿)</Label>
        <NumberInput value={item.annualContribution} onChange={v => onChange("annualContribution", v)} className="mt-1" />
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
  const userId = getSession()?.userId || "";
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<InvestmentAccount, "id">>(defaultInvestment());

  // Registry of built-in example funds + this user's own custom-added funds.
  // Re-read on every render of funds-dependent values via useMemo below so
  // newly-added custom funds show up immediately without a page reload.
  const [fundsVersion, setFundsVersion] = useState(0);
  const funds = useMemo(() => getAllFunds(userId), [userId, fundsVersion]);

  const handleAddFund = useCallback((input: CustomFundInput) => {
    addCustomFund(userId, input);
    setFundsVersion(v => v + 1);
    return input.code.trim().toUpperCase();
  }, [userId]);

  // AI forecast estimates, keyed by fund code — populated as each fund's
  // FundForecastCard finishes loading. Generalises the old aiPVDReturn /
  // aiSCBGoldReturn pair (which only worked for two hardcoded SCB funds).
  const [aiReturnByFundCode, setAiReturnByFundCode] = useState<Record<string, number>>({});

  const handleApplyAIForecast = useCallback((fundCode: string, estimatedReturn: number) => {
    setAiReturnByFundCode(prev => ({ ...prev, [fundCode]: estimatedReturn }));
    investments
      .filter(inv => inv.isActive && inv.fundCode === fundCode)
      .forEach(inv => updateInvestment(inv.id, { expectedAnnualReturn: estimatedReturn }));
  }, [investments, updateInvestment]);

  // Distinct fund codes actually held across active accounts — one
  // FundForecastCard is rendered per code, instead of two hardcoded cards.
  const heldFundCodes = useMemo(
    () => Array.from(new Set(investments.filter(i => i.isActive && i.fundCode).map(i => i.fundCode as string))),
    [investments],
  );
  const heldFunds = useMemo(
    () => heldFundCodes.map(code => funds.find(f => f.code === code)).filter((f): f is FundInfo => !!f),
    [heldFundCodes, funds],
  );
  // Always show the two built-in example funds even if not yet held, so new
  // users can still preview an AI forecast before adding an account.
  const exampleFundCodes = new Set(["PVDMPFEQ", "SCBGOLDHRMF"]);
  const cardFunds = useMemo(() => {
    const seen = new Set(heldFunds.map(f => f.code));
    const examples = funds.filter(f => exampleFundCodes.has(f.code) && !seen.has(f.code));
    return [...heldFunds, ...examples];
  }, [heldFunds, funds]);

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

      {/* ── AI Short-Term Radar — 7–14 day US stock scanner + simulation gauge ── */}
      <ShortTermAIRadar userId={userId} riskProfile={profile?.riskProfile} />

      {/* ── Short-term watchlist — pinned radar picks + on-demand price refresh ── */}
      <WatchlistCard userId={userId} />

      {/* ── Radar scorecard — grades matured scans against actual price moves ── */}
      <ScorecardCard />

      {/* ── AI Recommendation (on-demand, web-researched) ─────────────────────── */}
      <AIRecommendationCard
        investments={activeInvestments.map(i => ({
          name: i.name,
          accountType: i.accountType,
          assetDescription: i.assetDescription,
          marketValue: i.marketValue,
          expectedAnnualReturn: i.expectedAnnualReturn,
          monthlyContribution: i.monthlyContribution,
          annualContribution: i.annualContribution,
          isTaxAdvantaged: i.isTaxAdvantaged,
          currency: i.currency,
        }))}
        profile={{
          age: profile?.dateOfBirth ? calcAge(profile.dateOfBirth) : undefined,
          retirementAge: profile?.retirementAge,
          riskProfile: profile?.riskProfile,
          country: profile?.country,
        }}
        totals={{ totalValue, taxAdvantaged, monthlyContribs, weightedReturn }}
      />

      {/* ── AI Fund Forecasts — one card per fund the user actually holds,
            plus the two built-in example funds as a preview ──────────────── */}
      {cardFunds.map(fund => (
        <FundForecastCard
          key={fund.code}
          fund={fund}
          onApply={(estimatedReturn) => handleApplyAIForecast(fund.code, estimatedReturn)}
          hasMatchingAccounts={investments.some(i => i.isActive && i.fundCode === fund.code)}
        />
      ))}

      {/* ── DCA / RMF ROI Simulator ───────────────────────────────────────────── */}
      <DCASimulatorCard userId={userId} aiReturnByFundCode={aiReturnByFundCode} />

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
        <InvestmentForm item={formData} onChange={setField} funds={funds} aiReturnByFundCode={aiReturnByFundCode} onAddFund={handleAddFund} />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
