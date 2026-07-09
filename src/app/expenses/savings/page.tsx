"use client";

/**
 * /expenses/savings
 *
 * Dedicated Savings Cuts analysis. Two modes:
 *   - Local Scan: deterministic greedy algorithm in lib/savingsCuts.ts.
 *                 Always available, no network, no API key.
 *   - AI Scan:    POST /api/expenses/suggest-cuts (Haiku). On failure, the
 *                 page surfaces a clear error and a one-click "Run Local
 *                 Scan instead" button.
 *
 * Inputs come from the same store + transactions used on /expenses/actuals.
 * If there are no transactions yet, we fall back to using budget rows with
 * actual = budget (so Local Scan can still rank discretionary cuts off the
 * planned budget alone).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore, selectTotalMonthlyIncome } from "@/lib/store";
import { thb, toMonthly } from "@/lib/utils";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Badge,
  StatCard, PageHeader, Input, Select, EmptyState,
} from "@/components/ui";
import {
  Sparkles, Cpu, AlertTriangle, ChevronRight, Target, TrendingDown, Wallet,
} from "lucide-react";
import { budgetVsActual, ymLabel } from "@/lib/actuals";
import { localSuggestCuts, type CutsResult } from "@/lib/savingsCuts";
import { aiProviderHeaders } from "@/lib/ai-model-pref";
import ModelPicker from "@/components/ai/ModelPicker";

export default function SavingsPage() {
  const store = useStore();
  const { expenses, transactions } = store;
  const monthlyIncome = selectTotalMonthlyIncome(store);

  // ── Month selection ────────────────────────────────
  const allMonths = useMemo(() => {
    const set = new Set(transactions.map(t => t.billingMonth));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  useEffect(() => {
    if (!selectedMonth && allMonths.length) setSelectedMonth(allMonths[0]);
  }, [allMonths, selectedMonth]);

  // ── Build budget-vs-actual rows ────────────────────
  // If there are no transactions for the month, synthesize "actual = budget"
  // rows from the active expenses so Local Scan still has something to rank.
  const rows = useMemo(() => {
    if (selectedMonth && transactions.length > 0) {
      return budgetVsActual(expenses, transactions, selectedMonth);
    }
    // Synthesized rows
    const byCat: Record<string, { budget: number; essential: boolean }> = {};
    for (const e of expenses.filter(e => e.isActive)) {
      const m = toMonthly(e.amount, e.frequency);
      if (!byCat[e.category]) byCat[e.category] = { budget: 0, essential: false };
      byCat[e.category].budget += m;
      byCat[e.category].essential = byCat[e.category].essential || e.isEssential;
    }
    return Object.entries(byCat).map(([category, v]) => ({
      category, budget: Math.round(v.budget), actual: Math.round(v.budget),
      gap: 0, pctUsed: 1, status: "ok" as const,
      isEssential: v.essential, expenseIds: [],
    }));
  }, [expenses, transactions, selectedMonth]);

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const currentSavings = Math.max(0, monthlyIncome - totalActual);

  // ── State ──────────────────────────────────────────
  const [target, setTarget] = useState<number>(20000);
  const [result, setResult] = useState<CutsResult | null>(null);
  const [loading, setLoading] = useState<"local" | "ai" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────
  function runLocalScan() {
    setLoading("local");
    setAiError(null);
    // Synchronous, but defer one tick so the spinner shows.
    setTimeout(() => {
      const r = localSuggestCuts({
        monthlyIncome,
        monthlySavingsTarget: target,
        currentMonthlySavings: currentSavings,
        rows: rows.map(r => ({
          category: r.category, budget: r.budget, actual: r.actual,
          gap: r.gap, isEssential: r.isEssential,
        })),
      });
      setResult(r);
      setLoading(null);
    }, 50);
  }

  async function runAiScan() {
    setLoading("ai");
    setAiError(null);
    setResult(null);
    try {
      const res = await fetch("/api/expenses/suggest-cuts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiProviderHeaders() },
        body: JSON.stringify({
          monthlyIncome,
          monthlySavingsTarget: target,
          currentMonthlySavings: currentSavings,
          billingMonth: selectedMonth || "synthesized",
          rows: rows.map(r => ({
            category: r.category, budget: r.budget, actual: r.actual,
            gap: r.gap, isEssential: r.isEssential,
          })),
          topMerchants: [],
          recentMonths: [],
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setAiError(json.message || json.error || `AI request failed (${res.status})`);
        return;
      }
      setResult(json);
    } catch (e: any) {
      setAiError(e?.message || "AI request failed");
    } finally {
      setLoading(null);
    }
  }

  // ── Render ─────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Savings Cuts Optimizer"
        subtitle="Two modes — instant Local Scan, or AI-ranked cuts via Anthropic Haiku."
        actions={
          <Link href="/expenses">
            <Button variant="outline" size="sm">Back to Expenses</Button>
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard title="Monthly Income"   value={thb(monthlyIncome)} icon={Wallet} color="green" />
        <StatCard title="Monthly Budget"   value={thb(totalBudget)}   icon={Target} color="blue" />
        <StatCard title="Monthly Spend"    value={thb(totalActual)}   subtitle={selectedMonth ? ymLabel(selectedMonth) : "from budget"} icon={TrendingDown} color="amber" />
        <StatCard title="Current Savings"  value={thb(currentSavings)} subtitle={`${Math.round((currentSavings / Math.max(1, monthlyIncome)) * 100)}% of income`} icon={Sparkles} color="purple" />
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Run a Scan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Monthly savings target (THB)</label>
              <Input
                type="number"
                value={target}
                onChange={e => setTarget(Number(e.target.value))}
                className="w-40 mt-1"
              />
            </div>
            {allMonths.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground">Billing month (for actuals)</label>
                <Select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44 mt-1">
                  {allMonths.map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" onClick={runLocalScan} disabled={loading !== null || rows.length === 0}>
                <Cpu size={14} /> {loading === "local" ? "Scanning…" : "Local Scan"}
              </Button>
              <ModelPicker />
              <Button onClick={runAiScan} disabled={loading !== null || rows.length === 0}>
                <Sparkles size={14} /> {loading === "ai" ? "Asking AI…" : "AI Scan"}
              </Button>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            <strong>Local Scan</strong>: deterministic, instant, runs offline. <strong>AI Scan</strong>: uses Anthropic Haiku to generate human-ranked rationale (requires API credits).
            {transactions.length === 0 && (
              <span className="block mt-1 text-amber-500">
                No statement actuals imported yet — both scans will run against your <em>planned budget</em>. Import a statement at <Link href="/expenses/actuals" className="underline">/expenses/actuals</Link> for actual-vs-budget analysis.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI error pane with Local fallback */}
      {aiError && (
        <Card className="mb-6 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-red-500 mb-1">AI Scan unavailable</div>
                <div className="text-sm text-muted-foreground mb-3 break-words">{aiError}</div>
                <Button size="sm" variant="outline" onClick={runLocalScan}>
                  <Cpu size={14} /> Run Local Scan instead
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Suggested Cuts</CardTitle>
              <Badge variant={result.source === "ai" ? "default" : "outline"} className="text-xs">
                {result.source === "ai" ? "AI Scan (Haiku)" : "Local Scan"}
              </Badge>
            </div>
            {result.savingsGap > 0 && (
              <span className="text-xs text-amber-500">
                Gap to target: {thb(result.savingsGap)}/mo
              </span>
            )}
          </CardHeader>
          <CardContent>
            <div className="p-3 rounded-md bg-muted/50 text-sm mb-4">{result.summary}</div>
            {result.suggestions.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No cuts needed"
                description="You're already meeting your savings target. Keep going."
              />
            ) : (
              <div className="space-y-2">
                {result.suggestions.map((s, i) => (
                  <div key={i} className="border border-border rounded-md p-3">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <span className="font-semibold">{s.category}</span>
                        {s.isEssential && <Badge variant="outline" className="ml-2 text-xs">Essential</Badge>}
                        <Badge
                          className={`ml-2 text-xs ${
                            s.priority === "high" ? "bg-red-500/15 text-red-500"
                            : s.priority === "medium" ? "bg-amber-500/15 text-amber-500"
                            : "bg-blue-500/15 text-blue-500"
                          }`}
                        >
                          {s.priority}
                        </Badge>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-emerald-500 font-bold">−{thb(s.suggestedReduction)}/mo</div>
                        <div className="text-xs text-muted-foreground">from {thb(s.currentMonthly)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{s.reason}</p>
                    {s.exampleActions?.length > 0 && (
                      <ul className="text-xs space-y-1">
                        {s.exampleActions.map((a, j) => (
                          <li key={j} className="flex gap-1.5">
                            <ChevronRight size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!result && !loading && !aiError && (
        <EmptyState
          icon={Sparkles}
          title="Pick a scan mode"
          description="Local Scan runs instantly with no API. AI Scan uses Anthropic Haiku for human-ranked rationale."
        />
      )}
    </div>
  );
}
