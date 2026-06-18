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

/** Build budget-vs-actual rows from a category→monthly-actual map. */
function rowsFromActualsMap(
  expenses: ExpenseItem[],
  actuals: Record<string, number>
): BudgetVsActualRow[] {
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

export function budgetVsActual(
  expenses: ExpenseItem[],
  txns: Transaction[],
  ym: string
): BudgetVsActualRow[] {
  return rowsFromActualsMap(expenses, actualsByCategory(txns, ym));
}

/** Total spend per category across ALL billing months/years. */
export function allTimeActualsByCategory(txns: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    const sign = t.isCredit ? -1 : 1;
    out[t.category] = (out[t.category] ?? 0) + sign * t.amount;
  }
  for (const k of Object.keys(out)) if (out[k] < 0) out[k] = 0;
  return out;
}

/**
 * Budget vs AVERAGE monthly actual computed over every month of data
 * (all months and years), so the analyzer reflects the full history rather
 * than a single statement month. Average = all-time total ÷ months observed.
 */
export function budgetVsActualAllTime(
  expenses: ExpenseItem[],
  txns: Transaction[]
): BudgetVsActualRow[] {
  const monthCount = Math.max(1, listMonths(txns).length);
  const totals = allTimeActualsByCategory(txns);
  const avg: Record<string, number> = {};
  for (const k of Object.keys(totals)) avg[k] = totals[k] / monthCount;
  return rowsFromActualsMap(expenses, avg);
}

/** The biggest individual debit transactions in a category (high-runner records). */
export function topTransactionsForCategory(
  txns: Transaction[],
  category: string,
  limit = 5
): Transaction[] {
  return txns
    .filter(t => t.category === category && !t.isCredit)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export interface BudgetGap {
  category: string;
  budget: number;          // current monthly budget for the category
  actual: number;          // actual monthly spend
  gap: number;             // actual − budget (always > 0 here)
  unbudgeted: boolean;     // true when no budget line exists yet
  suggestedBudget: number; // rounded-up actual, a starting budget to set
  isEssential: boolean;
  /** Name of the specific budget line this gap is keyed to, when it maps to one item (smart-matched). */
  matchedItemName?: string;
  /** True when this gap's matches came from the AI matcher rather than the keyword heuristic. */
  aiMatched?: boolean;
}

/**
 * Per-transaction AI match overrides: transaction.id -> budget item id, or
 * `null` when the AI explicitly reasoned that no existing budget item fits.
 * Produced by POST /api/expenses/ai-match. When a transaction's id is a key
 * in this map, its value takes priority over matchTransactionToItem's
 * keyword-overlap heuristic — the whole point of asking the AI is to handle
 * cases (recurring-but-irregular merchants, split bills, mislabeled
 * descriptions) the heuristic can't reason about.
 */
export type AiMatchOverrides = Record<string, string | null>;

/** Resolve the budget item for a transaction, preferring an AI override when present. */
function resolveMatch(
  txn: Transaction,
  items: ExpenseItem[],
  aiMatches?: AiMatchOverrides
): ExpenseItem | undefined {
  if (aiMatches && Object.prototype.hasOwnProperty.call(aiMatches, txn.id)) {
    const itemId = aiMatches[txn.id];
    return itemId ? items.find(i => i.id === itemId) : undefined;
  }
  return matchTransactionToItem(txn, items);
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

// ── Smart merchant → budget-item mapping ────────────────────────────
// Generic English stopwords stripped before token-matching a budget item's
// name against a transaction's merchant text, so "Gym & Fitness" reduces to
// the meaningful tokens ["gym", "fitness"].
const NAME_STOPWORDS = new Set([
  "and", "the", "for", "of", "a", "an", "to", "in", "on", "at", "&",
  "monthly", "yearly", "domestic", "international",
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !NAME_STOPWORDS.has(w));
}

/**
 * Find the existing budget item (if any) a transaction most plausibly
 * belongs to — same category, plus at least one shared meaningful token
 * between the item's name and the transaction's merchant key/description.
 * This lets the analyzer recognize "FITNESS FIRST" as already covered by a
 * "Gym & Fitness" budget line, instead of lumping it into the category total
 * and flagging the whole category as a blind gap.
 */
export function matchTransactionToItem(
  txn: Transaction,
  items: ExpenseItem[]
): ExpenseItem | undefined {
  const haystack = `${txn.merchantKey ?? ""} ${txn.description ?? ""}`.toLowerCase();
  const candidates = items.filter(i => i.isActive && i.category === txn.category);
  let best: { item: ExpenseItem; score: number } | undefined;
  for (const item of candidates) {
    const tokens = nameTokens(item.name);
    const score = tokens.filter(t => haystack.includes(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
}

/**
 * Debit transactions the keyword heuristic couldn't match to any active
 * budget item — the candidate set to hand to the AI matcher. Excludes
 * transactions already overridden by a prior AI pass (those keep whatever
 * the AI decided last time, including an explicit "no match").
 */
export function collectUnmatchedTransactions(
  expenses: ExpenseItem[],
  txns: Transaction[],
  aiMatches?: AiMatchOverrides
): Transaction[] {
  const activeItems = expenses.filter(e => e.isActive);
  return txns.filter(t => {
    if (t.isCredit) return false;
    if (aiMatches && Object.prototype.hasOwnProperty.call(aiMatches, t.id)) return false;
    return !matchTransactionToItem(t, activeItems);
  });
}

/**
 * Smarter version of the gap analyzer: instead of comparing whole-category
 * totals (which can flag a category as "over budget" when one already-budgeted
 * line, e.g. a gym membership, is just running alongside unrelated unbudgeted
 * spend, e.g. a doctor visit), this matches each transaction to a specific
 * existing budget item by name when possible. Gaps are then reported either:
 *  - against the specific item that's actually running over its own budget, or
 *  - as genuinely unmatched/unbudgeted spend within the category.
 * Ranked by absolute gap (THB/mo), largest first.
 */
export function smartTopBudgetGaps(
  expenses: ExpenseItem[],
  txns: Transaction[],
  limit = 6,
  aiMatches?: AiMatchOverrides
): BudgetGap[] {
  const monthCount = Math.max(1, listMonths(txns).length);
  const activeItems = expenses.filter(e => e.isActive);

  const matchedTotals: Record<string, number> = {}; // itemId -> all-time actual
  const unmatchedTotals: Record<string, number> = {}; // category -> all-time actual (unmatched)
  const aiMatchedItemIds = new Set<string>();

  for (const t of txns) {
    if (t.isCredit) continue;
    const usedAi = !!aiMatches && Object.prototype.hasOwnProperty.call(aiMatches, t.id);
    const item = resolveMatch(t, activeItems, aiMatches);
    if (item) {
      matchedTotals[item.id] = (matchedTotals[item.id] ?? 0) + t.amount;
      if (usedAi) aiMatchedItemIds.add(item.id);
    } else {
      unmatchedTotals[t.category] = (unmatchedTotals[t.category] ?? 0) + t.amount;
    }
  }

  const gaps: BudgetGap[] = [];

  for (const item of activeItems) {
    const actualMonthly = (matchedTotals[item.id] ?? 0) / monthCount;
    const budgetMonthly = toMonthly(item.amount, item.frequency);
    const gap = actualMonthly - budgetMonthly;
    if (gap > 0 && actualMonthly > 0) {
      gaps.push({
        category: item.category,
        budget: budgetMonthly,
        actual: actualMonthly,
        gap,
        unbudgeted: false,
        suggestedBudget: Math.max(100, Math.ceil(actualMonthly / 100) * 100),
        isEssential: item.isEssential,
        matchedItemName: item.name,
        aiMatched: aiMatchedItemIds.has(item.id),
      });
    }
  }

  for (const [category, total] of Object.entries(unmatchedTotals)) {
    const actualMonthly = total / monthCount;
    if (actualMonthly <= 0) continue;
    const essentialGuess = activeItems.some(i => i.category === category && i.isEssential);
    gaps.push({
      category,
      budget: 0,
      actual: actualMonthly,
      gap: actualMonthly,
      unbudgeted: true,
      suggestedBudget: Math.max(100, Math.ceil(actualMonthly / 100) * 100),
      isEssential: essentialGuess,
    });
  }

  return gaps.sort((a, b) => b.gap - a.gap).slice(0, limit);
}

/**
 * High-runner transactions for a smart gap row: filters to the gap's category
 * and, when the gap is keyed to a specific matched item, to only the
 * transactions that matched that item (so "Gym & Fitness" doesn't pull in an
 * unrelated doctor visit, and vice versa for the unmatched/unbudgeted rows).
 */
export function topTransactionsForGap(
  txns: Transaction[],
  expenses: ExpenseItem[],
  gap: BudgetGap,
  limit = 5,
  aiMatches?: AiMatchOverrides
): Transaction[] {
  const activeItems = expenses.filter(e => e.isActive);
  return txns
    .filter(t => !t.isCredit && t.category === gap.category)
    .filter(t => {
      const matched = resolveMatch(t, activeItems, aiMatches);
      return gap.matchedItemName ? matched?.name === gap.matchedItemName : !matched;
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
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
