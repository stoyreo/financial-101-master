/**
 * ACTUALS AGGREGATION
 *
 * Pure helpers that turn a list of Transactions + ExpenseItem budgets into
 * the views the /expenses/actuals page needs:
 *   - month-by-category totals
 *   - budget-vs-actual gap
 *   - month-vs-month trend
 *   - prioritized cut suggestions (heuristic; AI route refines them)
 *
 * Bucketing is by `t.billingMonth` (statement-anchored). billingMonth is
 * derived from the STATEMENT DATE field on the imported PDF, so a single
 * credit-card statement period is one bucket regardless of which calendar
 * months its individual transactions land in.
 */

import type { ExpenseItem, Transaction } from "./types";
import { toMonthly } from "./utils";

/** "2026-04" key from any ISO date. */
export function ymKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Pretty month label e.g. "Apr 2026". */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** All distinct billing-month buckets present in the transaction set. */
export function listMonths(txns: Transaction[]): string[] {
  const set = new Set(txns.map(t => t.billingMonth || ymKey(t.postDate)));
  return Array.from(set).sort();
}

/**
 * Aggregate transactions for ONE billing month into category totals.
 * Filtering is by `t.billingMonth` (statement-anchored), not the calendar
 * month of the post date.
 *
 * Credits/refunds offset their category but the floor is 0 so a refund-only
 * month doesn't show as a negative actual.
 */
export function actualsByCategory(
  txns: Transaction[],
  ym: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    const bucket = t.billingMonth || ymKey(t.postDate);
    if (bucket !== ym) continue;
    const sign = t.isCredit ? -1 : 1;
    out[t.category] = (out[t.category] ?? 0) + sign * t.amount;
  }
  for (const k of Object.keys(out)) if (out[k] < 0) out[k] = 0;
  return out;
}

/** Total actual spend for a billing month across all categories. */
export function totalActuals(txns: Transaction[], ym: string): number {
  return Object.values(actualsByCategory(txns, ym)).reduce((s, v) => s + v, 0);
}

export interface BudgetVsActualRow {
  category: string;
  budget: number;
  actual: number;
  gap: number;
  pctUsed: number;
  status: "ok" | "warn" | "over";
  isEssential: boolean;
  budgetedItemIds: string[];
}

export function budgetVsActual(
  expenses: ExpenseItem[],
  txns: Transaction[],
  ym: string
): BudgetVsActualRow[] {
  const actuals = actualsByCategory(txns, ym);

  const budgetByCat: Record<string, { amount: number; essential: boolean; ids: string[] }> = {};
  for (const e of expenses.filter(e => e.isActive)) {
    const monthly = toMonthly(e.amount, e.frequency);
    if (!budgetByCat[e.category]) budgetByCat[e.category] = { amount: 0, essential: false, ids: [] };
    budgetByCat[e.category].amount += monthly;
    budgetByCat[e.category].essential = budgetByCat[e.category].essential || e.isEssential;
    budgetByCat[e.category].ids.push(e.id);
  }

  const allCats = Array.from(new Set<string>([...Object.keys(budgetByCat), ...Object.keys(actuals)]));
  const rows: BudgetVsActualRow[] = [];
  for (const cat of allCats) {
    const budget = budgetByCat[cat]?.amount ?? 0;
    const actual = actuals[cat] ?? 0;
    const gap = actual - budget;
    const pctUsed = budget > 0 ? actual / budget : actual > 0 ? Infinity : 0;
    const status: BudgetVsActualRow["status"] =
      pctUsed > 1.0 ? "over" : pctUsed >= 0.85 ? "warn" : "ok";
    rows.push({
      category: cat,
      budget,
      actual,
      gap,
      pctUsed,
      status,
      isEssential: budgetByCat[cat]?.essential ?? false,
      budgetedItemIds: budgetByCat[cat]?.ids ?? [],
    });
  }
  return rows.sort((a, b) => b.actual - a.actual);
}

export interface BudgetGap {
  category: string;
  budget: number;          // current monthly budget for the category
  actual: number;          // actual monthly spend
  gap: number;             // actual − budget (always > 0 here)
  unbudgeted: boolean;     // true when no budget line exists yet
  suggestedBudget: number; // rounded-up actual, a starting budget to set
  isEssential: boolean;
}

/**
 * Smart Analyzer: the most expensive categories where actual spend exceeds the
 * budget — i.e. the biggest gaps worth filling in. Unbudgeted categories
 * (budget = 0) surface here too, since their entire actual is an open gap.
 * Ranked by absolute gap (THB), largest first.
 */
export function topBudgetGaps(rows: BudgetVsActualRow[], limit = 6): BudgetGap[] {
  return rows
    .filter(r => r.gap > 0 && r.actual > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
    .map(r => ({
      category: r.category,
      budget: r.budget,
      actual: r.actual,
      gap: r.gap,
      unbudgeted: r.budget <= 0,
      suggestedBudget: Math.max(100, Math.ceil(r.actual / 100) * 100),
      isEssential: r.isEssential,
    }));
}

export interface MonthlyTrendPoint {
  ym: string;
  label: string;
  total: number;
  byCategory: Record<string, number>;
}

/** Trend across the last N billing months that have data. */
export function monthlyTrend(
  txns: Transaction[],
  lookbackMonths = 12
): MonthlyTrendPoint[] {
  const months = listMonths(txns).slice(-lookbackMonths);
  return months.map(ym => {
    const byCategory = actualsByCategory(txns, ym);
    const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
    return { ym, label: ymLabel(ym), total, byCategory };
  });
}

export interface CutSuggestion {
  category: string;
  currentMonthly: number;
  suggestedReduction: number;
  reason: string;
  priority: "high" | "medium" | "low";
  isEssential: boolean;
}

export function heuristicCutSuggestions(
  rows: BudgetVsActualRow[],
  monthlySavingsTarget: number
): CutSuggestion[] {
  const candidates = rows
    .filter(r => r.actual > 0)
    .sort((a, b) => {
      const aScore = (a.gap > 0 ? 1000 : 0) + (a.isEssential ? 0 : 500) + a.actual;
      const bScore = (b.gap > 0 ? 1000 : 0) + (b.isEssential ? 0 : 500) + b.actual;
      return bScore - aScore;
    });

  const suggestions: CutSuggestion[] = [];
  let saved = 0;
  for (const r of candidates) {
    if (saved >= monthlySavingsTarget) break;
    const trim = r.isEssential
      ? Math.min(r.actual * 0.1, Math.max(0, r.gap))
      : Math.min(r.actual * 0.4, monthlySavingsTarget - saved);
    if (trim < 100) continue;
    suggestions.push({
      category: r.category,
      currentMonthly: r.actual,
      suggestedReduction: Math.round(trim),
      priority: r.gap > 0 && !r.isEssential ? "high" : r.isEssential ? "low" : "medium",
      isEssential: r.isEssential,
      reason: r.gap > 0
        ? `Over budget by ${Math.round(r.gap).toLocaleString()} THB this month`
        : `Largest discretionary line - trimming ${Math.round((trim / r.actual) * 100)}% restores headroom`,
    });
    saved += trim;
  }
  return suggestions;
}

/**
 * Filter transactions by accountId for per-user isolation.
 * NEW: required for multi-account support.
 */
export function filterTransactionsByAccount(
  txns: Transaction[],
  accountId: string
): Transaction[] {
  return txns.filter(t => t.accountId === accountId);
}

/**
 * Build actuals for a specific account.
 * NEW: provides account-scoped calculations.
 */
export function buildActuals(
  txns: Transaction[],
  accountId: string,
  ym: string
): Record<string, number> {
  const filtered = filterTransactionsByAccount(txns, accountId);
  return actualsByCategory(filtered, ym);
}

/**
 * Select actuals for the active account.
 * Selector pattern for Zustand consumption.
 */
export const selectActualsForAccount = (
  txns: Transaction[],
  accountId: string,
  ym: string
) => buildActuals(txns, accountId, ym);
