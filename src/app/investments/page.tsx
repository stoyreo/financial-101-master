"use client";
import { useState, useCallback, useMemo } from "react";
import { useStore, selectTotalInvestmentValue } from "@/lib/store";
import { getSession } from "@/lib/auth-client";
import { thb, pct, calcAge } from "@/lib/utils";
import type { InvestmentAccount } from "@/lib/types";
import { getAllFunds, addCustomFund, type FundInfo, type CustomFundInput } from "@/lib/fund-registry";
import {
  Card, Button, Modal, Badge, StatCard, PageHeader,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui";
import { Plus, Edit, Trash2, PiggyBank, TrendingUp, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { InvestmentForm, defaultInvestment } from "./_components/InvestmentForm";
import { PortfolioCharts } from "./_components/PortfolioCharts";
import { ScenarioSimulator } from "./_components/ScenarioSimulator";
import { FundForecastCard } from "./_components/FundForecastCard";
import { AIRecommendationCard } from "./_components/AIRecommendationCard";
import { DCASimulatorCard } from "./_components/DCASimulatorCard";
import { ShortTermAIRadar } from "./_components/ShortTermAIRadar";
import { WatchlistCard } from "./_components/WatchlistCard";

// The two built-in example funds — previewed only while the user holds no
// linked funds yet, so new users can see what an AI forecast looks like.
const EXAMPLE_FUND_CODES = new Set(["PVDMPFEQ", "SCBGOLDHRMF"]);

export default function InvestmentsPage() {
  const { investments, retirement, profile, addInvestment, updateInvestment, deleteInvestment } = useStore();
  const store = useStore();
  const userId = getSession()?.userId || "";
  const [tab, setTab] = useState("portfolio");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<InvestmentAccount, "id">>(defaultInvestment());
  const [forecastsOpen, setForecastsOpen] = useState(false);

  // Registry of built-in example funds + this user's own custom-added funds.
  const [fundsVersion, setFundsVersion] = useState(0);
  const funds = useMemo(() => getAllFunds(userId), [userId, fundsVersion]);

  const handleAddFund = useCallback((input: CustomFundInput) => {
    addCustomFund(userId, input);
    setFundsVersion(v => v + 1);
    return input.code.trim().toUpperCase();
  }, [userId]);

  // AI forecast estimates, keyed by fund code — populated as each fund's
  // FundForecastCard finishes loading.
  const [aiReturnByFundCode, setAiReturnByFundCode] = useState<Record<string, number>>({});

  const handleApplyAIForecast = useCallback((fundCode: string, estimatedReturn: number) => {
    setAiReturnByFundCode(prev => ({ ...prev, [fundCode]: estimatedReturn }));
    investments
      .filter(inv => inv.isActive && inv.fundCode === fundCode)
      .forEach(inv => updateInvestment(inv.id, { expectedAnnualReturn: estimatedReturn }));
  }, [investments, updateInvestment]);

  // Distinct fund codes actually held across active accounts — one
  // FundForecastCard per code. Example funds only shown when nothing is held.
  const heldFunds = useMemo(() => {
    const codes = Array.from(new Set(investments.filter(i => i.isActive && i.fundCode).map(i => i.fundCode as string)));
    return codes.map(code => funds.find(f => f.code === code)).filter((f): f is FundInfo => !!f);
  }, [investments, funds]);
  const cardFunds = useMemo(
    () => heldFunds.length > 0 ? heldFunds : funds.filter(f => EXAMPLE_FUND_CODES.has(f.code)),
    [heldFunds, funds],
  );

  const totalValue = selectTotalInvestmentValue(store);
  const taxAdvantaged = investments.filter(i => i.isActive && i.isTaxAdvantaged).reduce((s, i) => s + i.marketValue, 0);
  const monthlyContribs = investments.filter(i => i.isActive).reduce((s, i) => s + i.monthlyContribution + i.annualContribution / 12, 0);
  const weightedReturn = totalValue > 0
    ? investments.filter(i => i.isActive).reduce((s, i) => s + i.expectedAnnualReturn * i.marketValue, 0) / totalValue
    : 0;
  const activeInvestments = investments.filter(i => i.isActive);
  const retirementTarget = retirement.expectedAnnualExpense / retirement.safeWithdrawalRate;

  const openAdd = () => {
    setFormData(defaultInvestment());
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Investments"
        subtitle="Track PVD, RMF, stocks, savings, and all investment accounts"
        actions={<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>}
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-2">
        <TabsList className="mb-4">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="ai">AI Tools</TabsTrigger>
          <TabsTrigger value="simulators">Simulators</TabsTrigger>
        </TabsList>

        {/* ── Portfolio: your actual data, first ─────────────────────────── */}
        <TabsContent value="portfolio">
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

          <PortfolioCharts
            activeInvestments={activeInvestments}
            totalValue={totalValue}
            retirementTarget={retirementTarget}
            safeWithdrawalRate={retirement.safeWithdrawalRate}
          />

          {/* Account table */}
          <Card>
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
        </TabsContent>

        {/* ── AI Tools: radar, watchlist (+scorecard), recommendation, forecasts ── */}
        <TabsContent value="ai">
          <ShortTermAIRadar userId={userId} riskProfile={profile?.riskProfile} />
          <WatchlistCard userId={userId} />

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

          {/* AI fund forecasts — collapsed accordion; one card per held fund
              (or the example funds while nothing is linked yet). */}
          <Card className="mb-6 p-4">
            <button
              onClick={() => setForecastsOpen(o => !o)}
              className="flex w-full items-center gap-2 text-sm font-semibold"
            >
              {forecastsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Sparkles className="h-4 w-4 text-violet-500" />
              AI Fund Forecasts
              <span className="ml-1 font-normal text-xs text-muted-foreground">
                {cardFunds.length} fund{cardFunds.length === 1 ? "" : "s"}
                {heldFunds.length === 0 && " (examples — link a fund to an account to forecast your own)"}
              </span>
            </button>
            {forecastsOpen && (
              <div className="mt-4">
                {cardFunds.map(fund => (
                  <FundForecastCard
                    key={fund.code}
                    fund={fund}
                    onApply={(estimatedReturn) => handleApplyAIForecast(fund.code, estimatedReturn)}
                    hasMatchingAccounts={investments.some(i => i.isActive && i.fundCode === fund.code)}
                  />
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Simulators: DCA + what-if scenario ─────────────────────────── */}
        <TabsContent value="simulators">
          <DCASimulatorCard userId={userId} aiReturnByFundCode={aiReturnByFundCode} />
          <ScenarioSimulator
            investments={investments}
            retirementTarget={retirementTarget}
            userAge={calcAge(profile.dateOfBirth)}
            retirementYear={
              profile.dateOfBirth
                ? new Date(profile.dateOfBirth).getFullYear() + retirement.retirementAge
                : undefined
            }
            riskProfile={profile.riskProfile}
          />
        </TabsContent>
      </Tabs>

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
