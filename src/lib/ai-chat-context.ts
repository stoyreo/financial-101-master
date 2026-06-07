/**
 * Compact "financial snapshot" builder for the AI Avatar chat.
 *
 * The chat panel can be mounted on different pages (actuals today, others
 * later). Rather than have the panel reach into page-specific state, each
 * host page builds a small, page-shaped snapshot with this helper and hands
 * it to <AiChatPanel snapshot={...}/>, which forwards it as `context` to
 * /api/ai/chat. Keep these SMALL — they're sent on every turn (folded into
 * just the latest user message server-side, not repeated per-turn).
 *
 * Mirrors the shape already proven out in /api/expenses/suggest-cuts and
 * /api/coach/forecast (rows / topMerchants / recentMonths), so the model
 * sees a familiar structure across every AI surface in the app.
 */

import type { BudgetVsActualRow, MonthlyTrendPoint } from "@/lib/actuals";

export interface ActualsChatSnapshot {
  kind: "actuals";
  billingMonth: string;          // "YYYY-MM"
  monthlyIncome: number;
  savingsTarget: number;
  totals: {
    actual: number;
    budget: number;
    gap: number;                 // actual - budget (positive = over)
    overCategoryCount: number;
  };
  rows: Array<{
    category: string;
    budget: number;
    actual: number;
    gap: number;
    pctUsed: number;
    status: "ok" | "warn" | "over";
    isEssential: boolean;
  }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
  recentMonths: Array<{ ym: string; total: number }>;
}

const round = (n: number) => Math.round(n || 0);

/**
 * Build a compact snapshot from the derived data already computed on
 * /expenses/actuals (budgetVsActual rows, monthlyTrend, top merchants, etc).
 * Caller passes through values it already has in `useMemo` — this function
 * does no recomputation, just shapes + trims for the model.
 */
export function buildActualsChatSnapshot(input: {
  billingMonth: string;
  monthlyIncome: number;
  savingsTarget: number;
  rows: BudgetVsActualRow[];
  trend: MonthlyTrendPoint[];
  topMerchants: Array<{ merchant: string; amount: number }>;
  monthTotal: number;
  monthBudget: number;
}): ActualsChatSnapshot {
  const {
    billingMonth, monthlyIncome, savingsTarget, rows, trend,
    topMerchants, monthTotal, monthBudget,
  } = input;

  const overRows = rows.filter(r => r.status === "over");

  return {
    kind: "actuals",
    billingMonth,
    monthlyIncome: round(monthlyIncome),
    savingsTarget: round(savingsTarget),
    totals: {
      actual: round(monthTotal),
      budget: round(monthBudget),
      gap: round(monthTotal - monthBudget),
      overCategoryCount: overRows.length,
    },
    // Cap at 12 categories — keeps payload small even for big budgets, and
    // 12 is already enough for the model to spot the real story.
    rows: rows.slice(0, 12).map(r => ({
      category: r.category,
      budget: round(r.budget),
      actual: round(r.actual),
      gap: round(r.gap),
      pctUsed: Math.round((r.pctUsed || 0) * 100) / 100,
      status: r.status,
      isEssential: r.isEssential,
    })),
    topMerchants: topMerchants.slice(0, 8).map(m => ({
      merchant: m.merchant,
      amount: round(m.amount),
    })),
    recentMonths: trend.slice(-6).map(t => ({ ym: t.ym, total: round(t.total) })),
  };
}

/**
 * General-purpose snapshot for pages that haven't registered anything richer
 * with the global AI avatar (useRegisterAiSnapshot in ai-snapshot-context.tsx).
 * Built from whole-of-plan store selectors (selectTotalMonthlyIncome,
 * selectNetWorth, etc.) — coarser than the actuals snapshot, but enough for
 * Fin to talk sensibly about the user's overall financial picture from any
 * page in the app (dashboard, debts, investments, scenarios, settings…).
 */
export interface GeneralChatSnapshot {
  kind: "general";
  scenarioName?: string | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  monthlyDebtPayments: number;
  totalDebtBalance: number;
  totalInvestmentValue: number;
  netWorth: number;
  mortgage?: { balance: number; monthlyPayment: number } | null;
}

export function buildGeneralChatSnapshot(input: {
  scenarioName?: string | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtPayments: number;
  totalDebtBalance: number;
  totalInvestmentValue: number;
  netWorth: number;
  mortgage?: { currentBalance: number; standardMonthlyPayment: number; extraMonthlyPayment: number } | null;
}): GeneralChatSnapshot {
  const {
    scenarioName, monthlyIncome, monthlyExpenses, monthlyDebtPayments,
    totalDebtBalance, totalInvestmentValue, netWorth, mortgage,
  } = input;

  return {
    kind: "general",
    scenarioName: scenarioName ?? null,
    monthlyIncome: round(monthlyIncome),
    monthlyExpenses: round(monthlyExpenses),
    monthlySurplus: round(monthlyIncome - monthlyExpenses - monthlyDebtPayments),
    monthlyDebtPayments: round(monthlyDebtPayments),
    totalDebtBalance: round(totalDebtBalance),
    totalInvestmentValue: round(totalInvestmentValue),
    netWorth: round(netWorth),
    mortgage: mortgage
      ? { balance: round(mortgage.currentBalance), monthlyPayment: round(mortgage.standardMonthlyPayment + mortgage.extraMonthlyPayment) }
      : null,
  };
}

type AnyChatSnapshot = ActualsChatSnapshot | GeneralChatSnapshot;

/** Human-readable one-liner shown in the panel header ("Looking at: June 2026 actuals"). */
export function describeSnapshot(s: AnyChatSnapshot | null | undefined): string | null {
  if (!s) return null;
  if (s.kind === "actuals") return `${s.billingMonth} actuals — ฿${s.totals.actual.toLocaleString()} spent vs ฿${s.totals.budget.toLocaleString()} budgeted`;
  if (s.kind === "general") {
    const scenario = s.scenarioName ? `${s.scenarioName} — ` : "";
    return `${scenario}net worth ฿${s.netWorth.toLocaleString()}, ฿${s.monthlySurplus.toLocaleString()}/mo surplus`;
  }
  return null;
}
