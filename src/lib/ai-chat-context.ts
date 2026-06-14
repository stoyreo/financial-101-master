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
import type {
  IncomeItem, ExpenseItem, DebtAccount, InvestmentAccount,
  RetirementAssumptions, TaxAssumptions, Scenario,
} from "@/lib/types";

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

// ── Full plan context (for system prompt memory layer) ────────────────────────

export interface FullPlanInput {
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
  retirement: RetirementAssumptions;
  tax: TaxAssumptions;
  scenarios: Scenario[];
  activeScenarioId: string;
}

const thb = (n: number) => `฿${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Builds a comprehensive [FINANCIAL PLAN] block for the system prompt so
 * Gemma4 has ALL the user's planning figures baked in — no need to re-ask.
 * Uses human-readable lines rather than raw JSON to stay within context limits.
 */
export function buildFullPlanContext(plan: FullPlanInput): string {
  const sections: string[] = [];

  // ── Incomes ──────────────────────────────────────────────
  const activeIncomes = plan.incomes.filter(i => i.isActive);
  if (activeIncomes.length > 0) {
    const lines = activeIncomes.map(i => {
      const monthly = i.frequency === "monthly" ? i.amount : i.frequency === "yearly" ? i.amount / 12 : 0;
      return `  • ${i.name} (${i.owner}, ${i.category}): ${thb(i.amount)}/${i.frequency}${monthly && i.frequency !== "monthly" ? ` = ${thb(monthly)}/mo` : ""}${i.annualGrowthRate ? `, +${pct(i.annualGrowthRate)}/yr` : ""}${i.isTaxable ? ", taxable" : ""}`;
    });
    sections.push(`INCOMES (active)\n${lines.join("\n")}`);
  }

  // ── Expenses ─────────────────────────────────────────────
  const activeExpenses = plan.expenses.filter(e => e.isActive);
  if (activeExpenses.length > 0) {
    const lines = activeExpenses.map(e => {
      const monthly = e.frequency === "monthly" ? e.amount : e.frequency === "yearly" ? e.amount / 12 : 0;
      return `  • ${e.name} (${e.category}${e.owner ? `, ${e.owner}` : ""}): ${thb(e.amount)}/${e.frequency}${monthly && e.frequency !== "monthly" ? ` = ${thb(monthly)}/mo` : ""}${e.isEssential ? " [essential]" : ""}`;
    });
    sections.push(`EXPENSES (active)\n${lines.join("\n")}`);
  }

  // ── Debts ────────────────────────────────────────────────
  const activeDebts = plan.debts.filter(d => d.isActive);
  if (activeDebts.length > 0) {
    const lines = activeDebts.map(d => {
      const extra = d.extraMonthlyPayment > 0 ? ` + ${thb(d.extraMonthlyPayment)} extra` : "";
      return `  • ${d.name} (${d.debtType}, ${d.lender}): balance ${thb(d.currentBalance)}, rate ${pct(d.annualInterestRate)} ${d.interestType}, payment ${thb(d.standardMonthlyPayment)}/mo${extra}${d.maturityDate ? `, matures ${d.maturityDate}` : ""}`;
    });
    sections.push(`DEBTS (active)\n${lines.join("\n")}`);
  }

  // ── Investments ──────────────────────────────────────────
  const activeInvestments = plan.investments.filter(i => i.isActive);
  if (activeInvestments.length > 0) {
    const lines = activeInvestments.map(i => {
      const contrib = i.monthlyContribution > 0 ? `, contributing ${thb(i.monthlyContribution)}/mo` : i.annualContribution > 0 ? `, contributing ${thb(i.annualContribution)}/yr` : "";
      return `  • ${i.name} (${i.accountType}, ${i.owner}): value ${thb(i.marketValue)}, expected return ${pct(i.expectedAnnualReturn)}${contrib}${i.isTaxAdvantaged ? " [tax-advantaged]" : ""}${i.assetDescription ? ` — ${i.assetDescription}` : ""}`;
    });
    sections.push(`INVESTMENTS (active)\n${lines.join("\n")}`);
  }

  // ── Retirement assumptions ────────────────────────────────
  const r = plan.retirement;
  sections.push(
    `RETIREMENT ASSUMPTIONS\n` +
    `  • Retire at age ${r.retirementAge}, expected annual expense ${thb(r.expectedAnnualExpense)}\n` +
    `  • Inflation ${pct(r.inflationRate)}, pre-retirement return ${pct(r.portfolioReturnPreRetirement)}, post-retirement return ${pct(r.portfolioReturnDuringRetirement)}\n` +
    `  • Safe withdrawal rate ${pct(r.safeWithdrawalRate)}${r.pensionMonthlyAmount > 0 ? `, pension ${thb(r.pensionMonthlyAmount)}/mo` : ""}${r.ssoMonthlyBenefit > 0 ? `, SSO ${thb(r.ssoMonthlyBenefit)}/mo` : ""}`
  );

  // ── Tax assumptions ───────────────────────────────────────
  const t = plan.tax;
  const deductions = [
    t.personalDeduction > 0 && `personal ${thb(t.personalDeduction)}`,
    t.pvdContribution > 0 && `PVD ${thb(t.pvdContribution)}`,
    t.rmfContribution > 0 && `RMF ${thb(t.rmfContribution)}`,
    t.ssfContribution > 0 && `SSF ${thb(t.ssfContribution)}`,
    t.lifeInsurancePremium > 0 && `life ins ${thb(t.lifeInsurancePremium)}`,
    t.healthInsurancePremium > 0 && `health ins ${thb(t.healthInsurancePremium)}`,
    t.mortgageInterestDeduction > 0 && `mortgage interest ${thb(t.mortgageInterestDeduction)}`,
    t.parentalDeduction > 0 && `parental ${thb(t.parentalDeduction)}`,
    t.childDeduction > 0 && `child ${thb(t.childDeduction)}`,
    t.otherDeductions > 0 && `other ${thb(t.otherDeductions)}`,
  ].filter(Boolean).join(", ");
  sections.push(
    `TAX ASSUMPTIONS (Thailand)\n` +
    `  • Gross income ${thb(t.annualGrossIncome)}/yr${t.annualBonus > 0 ? ` + bonus ${thb(t.annualBonus)}` : ""}\n` +
    (deductions ? `  • Deductions: ${deductions}` : "")
  );

  // ── Scenarios ─────────────────────────────────────────────
  if (plan.scenarios.length > 0) {
    const lines = plan.scenarios.map(s => {
      const active = s.id === plan.activeScenarioId ? " [ACTIVE]" : "";
      const a = s.assumptions;
      const details: string[] = [];
      if (a.incomeGrowthRate != null) details.push(`income growth ${pct(a.incomeGrowthRate)}`);
      if (a.inflationRate != null) details.push(`inflation ${pct(a.inflationRate)}`);
      if (a.investmentReturnRate != null) details.push(`investment return ${pct(a.investmentReturnRate)}`);
      if (a.mortgageExtraMonthlyPayment) details.push(`extra mortgage ${thb(a.mortgageExtraMonthlyPayment)}/mo`);
      if (a.annualBonusAmount) details.push(`bonus ${thb(a.annualBonusAmount)}/yr`);
      if (a.retirementAge) details.push(`retire at ${a.retirementAge}`);
      if (a.incomeShockFactor) details.push(`income shock ${pct(a.incomeShockFactor)} in ${a.incomeShockYear ?? "?"}`);
      return `  • ${s.name}${active}${s.description ? ` — ${s.description}` : ""}${details.length ? `\n    Assumptions: ${details.join(", ")}` : ""}`;
    });
    sections.push(`SCENARIOS\n${lines.join("\n")}`);
  }

  return `[FINANCIAL PLAN — full details, all figures in THB]\n${sections.join("\n\n")}`;
}
