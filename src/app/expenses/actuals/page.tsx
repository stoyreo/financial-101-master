"use client";

/**
 * /expenses/actuals
 *
 * Import credit-card statements (PDF), reconcile against the budget categories
 * defined on /expenses, see the gap, the month-vs-month trend, and live AI
 * recommendations to close the savings gap.
 *
 * Re-importing the same statement is a no-op — Transaction.dedupeKey filters
 * duplicates. ALL prior statements are kept for trend analysis.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useStore,
  selectTotalMonthlyIncome,
} from "@/lib/store";
import { thb } from "@/lib/utils";
import { getCurrentAccount } from "@/lib/accounts";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Badge,
  StatCard, PageHeader, EmptyState, Progress, Select,
} from "@/components/ui";
import {
  Upload, AlertTriangle, TrendingDown, Sparkles, FileText, Trash2,
  RefreshCw, Filter, ChevronRight, Smartphone,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip as RTip,
  Legend, Bar, Line, CartesianGrid,
} from "recharts";
import {
  budgetVsActual, actualsByCategory, monthlyTrend, ymKey, ymLabel,
  totalActuals,
} from "@/lib/actuals";
import { BUDGET_CATEGORIES } from "@/lib/categorize";
import type { Transaction, StatementImport, ExpenseItem } from "@/lib/types";
import { SavingsOptimizer } from "@/components/dashboard/SavingsOptimizer";
import { toMonthly } from "@/lib/utils";

const STATUS_BADGE = {
  ok: { label: "On track", color: "bg-emerald-500/15 text-emerald-500" },
  warn: { label: "Approaching", color: "bg-amber-500/15 text-amber-500" },
  over: { label: "Over budget", color: "bg-red-500/15 text-red-500" },
};

export default function ActualsPage() {
  const store = useStore();
  const {
    expenses, merchantRules,
    importStatement, recategorizeTransaction, deleteTransaction,
    clearMonthTransactions, deleteStatementImport, reapplyRules, updateExpense, addExpense,
    customExpenseCategories,
    lineUserId, setLineUserId, lineLastSyncedAt, setLineLastSyncedAt,
  } = store;

  // ── Read LINE UID from OAuth callback (?line_uid=Uxx…) ─────────────────
  const searchParams = useSearchParams();

  // ── Account isolation ─────────────────────────────────
  // CRITICAL: always filter by activeAccountId so no account's data leaks
  // into another account's view. The store holds ALL accounts' transactions
  // in a single flat array; the accountId field is the isolation boundary.
  const account = getCurrentAccount();
  const activeAccountId = account.id;
  const transactions = store.transactions.filter(
    t => t.accountId === activeAccountId || !t.accountId  // !t.accountId: legacy rows pre-isolation
  );
  const statementImports = store.statementImports.filter(
    i => i.accountId === activeAccountId || !i.accountId
  );

  // Built-in BUDGET_CATEGORIES + user-defined custom categories.
  const allCategories = [
    ...BUDGET_CATEGORIES,
    ...((customExpenseCategories ?? []).filter(c => !(BUDGET_CATEGORIES as readonly string[]).includes(c))),
  ];
  const monthlyIncome = selectTotalMonthlyIncome(store);

  // ── State ─────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── LINE sync state ────────────────────────────────────
  const [lineSyncing, setLineSyncing] = useState(false);
  const [lineSyncMsg, setLineSyncMsg] = useState<string | null>(null);
  const [showLinePanel, setShowLinePanel] = useState(false);

  // ── Persist LINE UID to localStorage forever (backup beyond Zustand) ──────
  // Ensures the credential survives store resets, cache clears, etc.
  useEffect(() => {
    if (lineUserId) {
      localStorage.setItem("line_uid_persistent", lineUserId);
    }
  }, [lineUserId]);

  // On mount: restore UID from localStorage if the Zustand store is empty
  useEffect(() => {
    if (!lineUserId) {
      const stored = localStorage.getItem("line_uid_persistent");
      if (stored) setLineUserId(stored);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-start LINE sync when page opens and LINE is connected ─────────────
  // Fires on mount (if already connected) or right after localStorage restore
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (lineUserId && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      setShowLinePanel(true);
      // Small delay so the panel renders before the sync request fires
      setTimeout(handleLineSync, 400);
    }
  }, [lineUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture LINE UID from the OAuth callback redirect (?line_uid=Uxx…)
  // and persist it to the store. Also auto-open the sync panel.
  useEffect(() => {
    const uid = searchParams.get("line_uid");
    const lineErr = searchParams.get("line_error");
    if (uid) {
      setLineUserId(uid);
      setShowLinePanel(true);
      // Clean the query param from the URL without a history entry
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
    if (lineErr) {
      setLineSyncMsg(`LINE connection failed (${lineErr}). Please try again.`);
      setShowLinePanel(true);
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, [searchParams, setLineUserId]);

  // Bucket by credit-card billing month (derived from STATEMENT DATE on the
  // PDF), so a statement that covers e.g. 23 Mar → 22 Apr is one "April"
  // bucket regardless of which side of the month each transaction landed.
  const allMonths = useMemo(() => {
    const set = new Set(transactions.map(t => t.billingMonth));
    set.add(new Date().toISOString().slice(0, 7)); // always show current month
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  useEffect(() => {
    if (!selectedMonth && allMonths.length) setSelectedMonth(allMonths[0]);
  }, [allMonths, selectedMonth]);

  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<"all" | "line" | "statement">("all");
  const [savingsTarget, setSavingsTarget] = useState<number>(20000);

  // ── Derived data ─────────────────────────────────────
  const rows = useMemo(
    () => budgetVsActual(expenses, transactions, selectedMonth || ""),
    [expenses, transactions, selectedMonth]
  );
  const trend = useMemo(() => monthlyTrend(transactions, 12), [transactions]);
  const monthTotal = selectedMonth ? totalActuals(transactions, selectedMonth) : 0;
  const monthBudget = rows.reduce((s, r) => s + r.budget, 0);
  const monthGap = monthTotal - monthBudget;
  const overCategories = rows.filter(r => r.status === "over");

  const monthTxns = useMemo(
    () => transactions.filter(t => t.billingMonth === selectedMonth),
    [transactions, selectedMonth]
  );
  const filteredTxns = useMemo(() => {
    return monthTxns.filter(t => {
      if (filterCat !== "all" && t.category !== filterCat) return false;
      if (filterSource === "line" && t.source !== "line") return false;
      if (filterSource === "statement" && t.source === "line") return false;
      return true;
    });
  }, [monthTxns, filterCat, filterSource]);

  // Count of LINE transactions across ALL months (for the hint strip)
  const totalLineTxns = useMemo(() => 
    transactions.filter(t => t.source === "line").length,
  [transactions]);
  const lineMonths = useMemo(() => {
    const set = new Set(transactions.filter(t => t.source === "line").map(t => t.billingMonth));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of monthTxns) {
      if (t.isCredit) continue;
      map[t.description] = (map[t.description] ?? 0) + t.amount;
    }
    return Object.entries(map)
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [monthTxns]);

  // ── Handlers ─────────────────────────────────────────
  async function handleFile(file: File) {
    setUploading(true);
    setImportMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const res = await fetch("/api/statements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeAccountId,
          mediaType: file.type || "application/pdf",
          data: b64,
          fileName: file.name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      const { added, duplicates, statementImportId } = importStatement(
        {
          accountId: activeAccountId,          // REQUIRED — scopes this import to the active account
          fileName: json.statement.fileName,
          fileHash: json.statement.fileHash,
          bank: json.statement.bank,
          statementDate: json.statement.statementDate,
          billingMonth: json.statement.billingMonth,
          periodStart: json.statement.periodStart,
          periodEnd: json.statement.periodEnd,
          totalCharges: json.statement.totalCharges,
          totalCredits: json.statement.totalCredits,
          cardholderName: json.statement.cardholderName,
        },
        json.transactions as Transaction[],
      );
      setSelectedMonth(json.statement.billingMonth);
      setImportMsg(
        `Imported ${added} new transaction${added === 1 ? "" : "s"} from ${json.statement.bank} statement dated ${json.statement.statementDate} (billing ${ymLabel(json.statement.billingMonth)})` +
        (duplicates > 0 ? ` · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : "")
      );
    } catch (e: any) {
      setImportMsg(`Error: ${e.message ?? "import failed"}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── LINE sync handler ────────────────────────────────
  async function handleLineSync() {
    if (!lineUserId) { setLineSyncMsg("Connect with LINE first."); return; }
    setLineSyncing(true);
    setLineSyncMsg(null);
    try {
      const res = await fetch("/api/line/fetch-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, activeAccountId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Sync failed");

      const { transactions: fetched, total } = json as { transactions: Transaction[]; total: number };

      // Merge into the store via importStatement — reuses its deduplication logic.
      // We pass an empty-shell "statement" since LINE txns have no statement PDF.
      const now = new Date().toISOString();
      const { added, duplicates } = importStatement(
        {
          accountId: activeAccountId,
          fileName: `LINE sync ${now.slice(0, 10)}`,
          bank: "LINE",
          statementDate: now.slice(0, 10),
          billingMonth: now.slice(0, 7),
          periodStart: now.slice(0, 10),
          periodEnd: now.slice(0, 10),
          totalCharges: fetched.filter(t => !t.isCredit).reduce((s, t) => s + t.amount, 0),
          totalCredits: 0,
        },
        fetched,
      );

      setLineLastSyncedAt(now);
      setLineSyncMsg(
        `Synced ${total} transactions from LINE — ${added} new, ${duplicates} already on file.`
      );

      if (added > 0) {
        // Auto-switch to the most recent month that has new LINE data
        const syncedMonths = fetched
          .map((t: any) => t.billingMonth as string)
          .filter(Boolean)
          .sort()
          .reverse();
        if (syncedMonths[0] && syncedMonths[0] !== selectedMonth) {
          setSelectedMonth(syncedMonths[0]);
        }
        setShowLinePanel(false);
      }
    } catch (e: any) {
      setLineSyncMsg(`Error: ${e.message ?? "sync failed"}`);
    } finally {
      setLineSyncing(false);
    }
  }

  // ── Build LINE OAuth URL for sync-mode connect ───────────────────────────
  function buildLineConnectUrl() {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID;
    if (!clientId || typeof window === "undefined") return "#";
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/line/callback`);
    return `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=sync&scope=profile%20openid`;
  }

  // ── Empty state: no imports yet ──────────────────────
  if (transactions.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="Actuals — Statement Import"
          subtitle="Reconcile real spending from your credit-card statements against the budget categories on /expenses."
          actions={<Link href="/expenses"><Button variant="outline" size="sm">Back to Budget</Button></Link>}
        />
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Upload}
              title="No statements imported yet"
              description="Drop a credit-card statement PDF (UOB, KBank, SCB, KTC, TMB) and the AI will extract every transaction and map it to your budget categories."
              action={
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload size={14} /> {uploading ? "Extracting…" : "Import Statement PDF"}
                  </Button>
                </>
              }
            />
            {importMsg && <p className="mt-4 text-center text-sm text-muted-foreground">{importMsg}</p>}

            {/* LINE sync in empty state */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground text-center mb-3">
                Or pull transactions directly from the LINE Expense Tracker
              </p>
              <div className="flex items-center justify-center gap-3">
                {lineUserId ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Connected as{" "}
                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                        {lineUserId.slice(0, 8)}…
                      </code>
                    </span>
                    <Button
                      size="sm"
                      onClick={handleLineSync}
                      disabled={lineSyncing}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white"
                    >
                      <Smartphone size={13} className={lineSyncing ? "animate-pulse" : ""} />
                      {lineSyncing ? "Syncing…" : "Sync LINE"}
                    </Button>
                  </>
                ) : (
                  <a href={buildLineConnectUrl()} className="inline-flex">
                    <Button size="sm" className="bg-[#06C755] hover:bg-[#05a847] text-white">
                      <Smartphone size={13} />
                      Connect with LINE
                    </Button>
                  </a>
                )}
              </div>
              {lineSyncMsg && (
                <p className={`mt-2 text-xs text-center ${lineSyncMsg.startsWith("LINE connection failed") ? "text-red-400" : "text-cyan-400"}`}>
                  {lineSyncMsg}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Actuals — Statement Import"
        subtitle="Real spending vs. budget, month over month."
        actions={
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={14} /> {uploading ? "Extracting…" : "Import Statement"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLinePanel(v => !v)}
              className={showLinePanel ? "border-cyan-500 text-cyan-500" : ""}
            >
              <Smartphone size={14} /> Sync from LINE
            </Button>
            <Link href="/expenses/savings">
              <Button size="sm"><Sparkles size={14} /> Savings Optimizer</Button>
            </Link>
          </div>
        }
      />

      {importMsg && (
        <div className="mb-4 px-3 py-2 rounded-md bg-blue-500/10 text-blue-500 text-sm">{importMsg}</div>
      )}

      {/* LINE sync panel */}
      {showLinePanel && (
        <Card className="mb-4 border-cyan-500/30 bg-cyan-500/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone size={14} className="text-cyan-500" />
              Sync from LINE Expense Tracker
              {lineLastSyncedAt && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  Last synced {lineLastSyncedAt.slice(0, 10)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lineUserId ? (
              /* Already connected — one-click sync */
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Connected as{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                    {lineUserId.slice(0, 8)}…
                  </code>
                </span>
                <button
                  onClick={() => { setLineUserId(""); setLineSyncMsg(null); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  title="Disconnect LINE account"
                >
                  Disconnect
                </button>
                <Button
                  size="sm"
                  onClick={handleLineSync}
                  disabled={lineSyncing}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0 ml-auto"
                >
                  <RefreshCw size={13} className={lineSyncing ? "animate-spin" : ""} />
                  {lineSyncing ? "Syncing…" : "Sync Now"}
                </Button>
              </div>
            ) : (
              /* Not connected — show LINE OAuth button */
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground flex-1">
                  Authorize once with LINE to pull transactions automatically.
                  No UID copy-paste required.
                </p>
                <a href={buildLineConnectUrl()} className="inline-flex shrink-0">
                  <Button size="sm" className="bg-[#06C755] hover:bg-[#05a847] text-white">
                    <Smartphone size={13} />
                    Connect with LINE
                  </Button>
                </a>
              </div>
            )}
            {lineSyncMsg && (
              <p className={`mt-2 text-xs ${lineSyncMsg.startsWith("LINE connection failed") || lineSyncMsg.startsWith("Error") ? "text-red-400" : "text-cyan-400"}`}>
                {lineSyncMsg}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Month selector + summary stats */}
      <div className="flex items-end gap-4 mb-4 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">Billing Month</label>
          <Select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="mt-1 w-44">
            {allMonths.map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {statementImports.length} statement{statementImports.length === 1 ? "" : "s"} on file
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard title="Actual Spend" value={thb(monthTotal)} subtitle={selectedMonth ? ymLabel(selectedMonth) : ""} icon={TrendingDown} color={monthGap > 0 ? "red" : "green"} />
        <StatCard title="Budgeted" value={thb(monthBudget)} icon={FileText} color="blue" />
        <StatCard title={monthGap > 0 ? "Over Budget" : "Under Budget"} value={thb(Math.abs(monthGap))} icon={AlertTriangle} color={monthGap > 0 ? "red" : "green"} />
        <StatCard title="Over-budget Categories" value={String(overCategories.length)} subtitle={overCategories.slice(0, 3).map(c => c.category).join(", ") || "—"} icon={AlertTriangle} color="amber" />
      </div>

      {/* Trend chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Monthly Spend Evolution (last {trend.length} months)</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length < 2 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Import another statement to start showing month-over-month trend.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trend.map(p => ({ month: p.label, actual: Math.round(p.total), budget: Math.round(monthBudget) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTip formatter={(v: number) => thb(v)} />
                <Legend />
                <Bar dataKey="actual" fill="#3b82f6" name="Actual" />
                <Line type="monotone" dataKey="budget" stroke="#ef4444" name="Budget" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Savings Optimizer Simulator */}
      {selectedMonth && rows.length > 0 && (
        <SavingsOptimizer
          rows={rows}
          monthlyIncome={monthlyIncome}
          initialTarget={savingsTarget}
          onApply={(newBudgets) => {
            for (const cat of Object.keys(newBudgets)) {
              const newTotal = newBudgets[cat];
              const items = expenses.filter(e => e.isActive && e.category === cat);
              if (items.length === 0) continue;
              const currentMonthlyTotal = items.reduce(
                (s, e) => s + toMonthly(e.amount, e.frequency), 0
              );
              if (currentMonthlyTotal === 0) {
                const each = newTotal / items.length;
                for (const it of items) {
                  const newMonthly = each;
                  const inUnit = it.frequency === "yearly"
                    ? newMonthly * 12
                    : it.frequency === "one-time"
                      ? it.amount
                      : newMonthly;
                  updateExpense(it.id, { amount: Math.round(inUnit) });
                }
                continue;
              }
              for (const it of items) {
                const itMonthly = toMonthly(it.amount, it.frequency);
                const share = itMonthly / currentMonthlyTotal;
                const newMonthly = newTotal * share;
                const inUnit = it.frequency === "yearly"
                  ? newMonthly * 12
                  : it.frequency === "one-time"
                    ? it.amount
                    : newMonthly;
                updateExpense(it.id, { amount: Math.round(inUnit) });
              }
            }
            setImportMsg("Optimized plan applied to budget. See /expenses for the new budget amounts.");
          }}
        />
      )}

      {/* Budget vs Actual */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Budget vs Actual — {selectedMonth ? ymLabel(selectedMonth) : ""}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Category", "Budget", "Actual", "Used", "Gap", "Status"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.category} className="border-b border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.category}</div>
                    {r.isEssential && <div className="text-xs text-muted-foreground">Essential</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{thb(r.budget)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{thb(r.actual)}</td>
                  <td className="px-3 py-2 w-40">
                    <Progress
                      value={Math.min(100, r.pctUsed * 100)}
                      color={r.status === "over" ? "bg-red-500" : r.status === "warn" ? "bg-amber-500" : "bg-emerald-500"}
                    />
                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {Number.isFinite(r.pctUsed) ? `${(r.pctUsed * 100).toFixed(0)}%` : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className={r.gap > 0 ? "text-red-500" : "text-emerald-500"}>
                      {r.gap > 0 ? "+" : ""}{thb(r.gap)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.status].color}`}>
                      {STATUS_BADGE[r.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td className="px-3 py-2 font-semibold">TOTAL</td>
                <td className="px-3 py-2 font-bold tabular-nums">{thb(monthBudget)}</td>
                <td className="px-3 py-2 font-bold tabular-nums">{thb(monthTotal)}</td>
                <td colSpan={2} className="px-3 py-2 tabular-nums">
                  <span className={monthGap > 0 ? "text-red-500" : "text-emerald-500"}>
                    {monthGap > 0 ? "Over by " : "Under by "}{thb(Math.abs(monthGap))}
                  </span>
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm">
            Transactions — {selectedMonth ? ymLabel(selectedMonth) : ""} ({filteredTxns.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-muted-foreground" />
            {/* Source filter */}
            <Select value={filterSource} onChange={e => setFilterSource(e.target.value as "all" | "line" | "statement")} className="h-8 text-xs w-36">
              <option value="all">All Sources</option>
              <option value="line">LINE only</option>
              <option value="statement">Statement only</option>
            </Select>
            {/* Category filter */}
            <Select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-8 text-xs w-40">
              <option value="all">All Categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Button variant="outline" size="sm" onClick={() => reapplyRules()} title="Re-apply merchant rules to all stored transactions">
              <RefreshCw size={12} /> Re-apply rules
            </Button>
          </div>
        </CardHeader>
        {/* LINE transactions cross-month hint */}
        {totalLineTxns > 0 && filterSource !== "line" && (
          <div className="px-4 pb-0">
            <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-500/10 rounded-md px-3 py-1.5">
              <Smartphone size={12} />
              <span>
                {totalLineTxns} LINE transaction{totalLineTxns === 1 ? "" : "s"} across {lineMonths.length} month{lineMonths.length === 1 ? "" : "s"}
                {lineMonths.length > 0 && ` (${lineMonths.map(m => ymLabel(m)).join(", ")})`}.
              </span>
              <button
                onClick={() => setFilterSource("line")}
                className="ml-auto underline hover:text-cyan-300 shrink-0"
              >
                Show LINE only
              </button>
            </div>
          </div>
        )}
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Date", "Description", "Card", "Amount", "Category", ""].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map(t => (
                  <tr key={t.id} className={`border-b border-border hover:bg-muted/30 ${t.isCredit ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 tabular-nums text-xs whitespace-nowrap">
                      {t.postDate}
                      {t.transDate !== t.postDate && (
                        <div className="text-muted-foreground">trx {t.transDate}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium flex items-center gap-1.5">
                        {t.description}
                        {t.source === "line" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium shrink-0">LINE</span>
                        )}
                      </div>
                      {t.fxAmount && (
                        <div className="text-xs text-muted-foreground">
                          {t.fxCurrency} {t.fxAmount.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {t.cardLast4 ? `•••• ${t.cardLast4}` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      <span className={t.isCredit ? "text-emerald-500" : ""}>
                        {t.isCredit ? "−" : ""}{thb(t.amount)}
                      </span>
                      {t.isCredit && <Badge variant="outline" className="ml-2 text-xs">Refund/Pay</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={t.category}
                        onChange={e => recategorizeTransaction(t.id, e.target.value, true)}
                        className="h-8 text-xs w-32"
                        title="Re-mapping a category also saves a merchant rule for future imports."
                      >
                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                      {t.confidence < 0.7 && (
                        <div className="text-xs text-amber-500 mt-1">Low confidence</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteTransaction(t.id)}
                        className="p-1 hover:bg-destructive/10 rounded-md"
                        title="Delete transaction"
                      >
                        <Trash2 size={12} className="text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Statement history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statement History ({statementImports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[...statementImports].sort((a, b) => b.statementDate.localeCompare(a.statementDate)).map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <FileText size={12} className="text-muted-foreground" />
                  <span className="font-medium">{ymLabel(s.billingMonth)} · {s.bank}</span>
                  <span className="text-muted-foreground">{s.fileName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{thb(s.totalCharges)} charged</span>
                  <span className="text-muted-foreground tabular-nums">{s.transactionCount} txns added</span>
                  {s.duplicatesSkipped > 0 && (
                    <span className="text-amber-500 tabular-nums">{s.duplicatesSkipped} dupes skipped</span>
                  )}
                  {/* Clear transactions only — keeps record for trend history */}
                  <button
                    onClick={() => {
                      if (confirm(`Clear all transactions for ${ymLabel(s.billingMonth)}? The statement record stays for trend history.`)) {
                        clearMonthTransactions(s.billingMonth, activeAccountId);
                      }
                    }}
                    className="p-1 hover:bg-amber-500/10 rounded-md"
                    title="Clear transactions only — keeps statement record for trend history"
                  >
                    <RefreshCw size={11} className="text-amber-500" />
                  </button>
                  {/* Delete statement + all its transactions entirely */}
                  <button
                    onClick={() => {
                      if (confirm(`Permanently delete the \${ymLabel(s.billingMonth)} \${s.bank} statement and all its transactions? This cannot be undone.`)) {
                        deleteStatementImport(s.id);
                      }
                    }}
                    className="p-1 hover:bg-destructive/10 rounded-md"
                    title="Delete statement and all its transactions permanently"
                  >
                    <Trash2 size={11} className="text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
