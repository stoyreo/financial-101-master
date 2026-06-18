/**
 * AI INSIGHTS ENGINE
 * ──────────────────
 * Provides contextual, actionable insights for each menu section.
 * Returns brief AI recommendations (2-3 sentences max).
 * Uses profile data for personalized optimization suggestions.
 */

import type {
  Profile, IncomeItem, ExpenseItem, DebtAccount,
  InvestmentAccount, ScenarioAssumptions,
} from "./types";
import { safeDivide, toYearly, effectiveIncomeAmount } from "./utils";

export type MenuType = "income" | "expenses" | "investments" | "debts" | "scenarios";

export interface InsightResult {
  title: string;
  insight: string;           // 2-3 sentences max
  actionItems: string[];     // 1-3 concrete next steps
  priority: "high" | "medium" | "low";
  icon?: string;             // Optional icon key
}

/**
 * Analyze menu data and generate personalized AI insights.
 */
export function analyzeMenuInsights(
  menuType: MenuType,
  profileData: {
    profile: Profile;
    incomes: IncomeItem[];
    expenses: ExpenseItem[];
    debts: DebtAccount[];
    investments: InvestmentAccount[];
  }
): InsightResult {
  switch (menuType) {
    case "income":
      return analyzeIncome(profileData);
    case "expenses":
      return analyzeExpenses(profileData);
    case "investments":
      return analyzeInvestments(profileData);
    case "debts":
      return analyzeDebts(profileData);
    case "scenarios":
      return analyzeScenarios(profileData);
    default:
      return defaultInsight();
  }
}

// ─────── INCOME INSIGHTS ───────
function analyzeIncome(profileData: {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}): InsightResult {
  const { incomes, expenses, debts } = profileData;

  const activeIncomes = incomes.filter(i => i.isActive);
  const totalIncome = activeIncomes.reduce((s, i) => s + toYearly(effectiveIncomeAmount(i), i.frequency), 0);
  const totalExpenses = expenses.filter(e => e.isActive).reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);
  const discretionaryIncome = totalIncome - totalExpenses;

  // Check income diversification
  const incomeTypes = new Set(activeIncomes.map(i => i.category)).size;
  const isSingleSource = incomeTypes === 1;

  if (isSingleSource && activeIncomes.length === 1) {
    return {
      title: "Income Diversification Opportunity",
      insight: "Your income comes from a single source. Consider building additional income streams (side projects, investments, rental income) to reduce financial vulnerability and accelerate wealth building.",
      actionItems: [
        "Explore freelance or part-time opportunities in your field",
        "Evaluate passive income options (dividends, rental property)",
        "Set up automated investments from discretionary income",
      ],
      priority: "high",
      icon: "trending-up",
    };
  }

  if (discretionaryIncome < 0) {
    return {
      title: "Expenses Exceed Income",
      insight: "Your expenses are exceeding your income. This requires immediate attention—reduce expenses or increase income to avoid debt accumulation.",
      actionItems: [
        "Review and cut non-essential expenses",
        "Look for budget optimization opportunities",
        "Consider a side income source or ask for a raise",
      ],
      priority: "high",
      icon: "alert-triangle",
    };
  }

  const savingsRate = safeDivide(discretionaryIncome, totalIncome);
  if (savingsRate < 0.1) {
    return {
      title: "Low Savings Rate",
      insight: `Your current savings rate is ${(savingsRate * 100).toFixed(1)}%. Financial experts recommend 10-20% of income. Increase contributions to long-term wealth building.`,
      actionItems: [
        "Set up automatic transfers to savings/investments",
        "Review expense categories and cut 5-10%",
        "Track income growth to increase saving capacity",
      ],
      priority: "high",
      icon: "trending-down",
    };
  }

  return {
    title: "Strong Income Foundation",
    insight: `Your income is ${incomeTypes > 1 ? "well-diversified" : "stable"}. Focus on optimizing your savings rate (${(savingsRate * 100).toFixed(1)}%) and directing surplus funds toward high-priority goals.`,
    actionItems: [
      "Review investment allocation for your discretionary income",
      "Ensure adequate emergency fund (3-6 months expenses)",
      "Plan for income growth and tax optimization",
    ],
    priority: "medium",
    icon: "check-circle",
  };
}

// ─────── EXPENSE INSIGHTS ───────
function analyzeExpenses(profileData: {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}): InsightResult {
  const { expenses, incomes } = profileData;

  const activeExpenses = expenses.filter(e => e.isActive);
  const totalExpenses = activeExpenses.reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);
  const totalIncome = incomes.filter(i => i.isActive).reduce((s, i) => s + toYearly(effectiveIncomeAmount(i), i.frequency), 0);

  const essentialExpenses = activeExpenses
    .filter(e => e.isEssential)
    .reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);

  const discretionaryExpenses = totalExpenses - essentialExpenses;
  const expenseRatio = safeDivide(totalExpenses, totalIncome);

  if (expenseRatio > 0.9) {
    return {
      title: "High Expense-to-Income Ratio",
      insight: "You're spending 90%+ of income. This leaves minimal room for savings and emergencies. Reduce discretionary expenses to free up funds for financial security.",
      actionItems: [
        "Cut non-essential spending by 10-20%",
        "Review subscriptions and recurring charges",
        "Negotiate better rates on utilities and insurance",
      ],
      priority: "high",
      icon: "alert-triangle",
    };
  }

  const discretionaryRatio = safeDivide(discretionaryExpenses, totalExpenses);
  if (discretionaryRatio > 0.3) {
    return {
      title: "Optimization Opportunity in Discretionary Spending",
      insight: `${(discretionaryRatio * 100).toFixed(1)}% of spending is discretionary. A modest 10-15% reduction could fund retirement or debt payoff.`,
      actionItems: [
        "Identify top 3 discretionary expense categories",
        "Set realistic but ambitious reduction targets",
        "Redirect savings to high-impact financial goals",
      ],
      priority: "medium",
      icon: "trending-down",
    };
  }

  return {
    title: "Healthy Expense Profile",
    insight: "Your expenses are well-managed relative to income. Continue monitoring for inflation impact and ensure essential expenses remain under control.",
    actionItems: [
      "Annually review and adjust for inflation",
      "Maintain emergency fund coverage",
      "Track budget vs. actuals each quarter",
    ],
    priority: "low",
    icon: "check-circle",
  };
}

// ─────── INVESTMENT INSIGHTS ───────
function analyzeInvestments(profileData: {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}): InsightResult {
  const { investments, profile, debts, incomes, expenses } = profileData;

  const activeInvestments = investments.filter(i => i.isActive);
  const totalInvested = activeInvestments.reduce((s, i) => s + i.marketValue, 0);
  const taxAdvantaged = activeInvestments
    .filter(i => i.isTaxAdvantaged)
    .reduce((s, i) => s + i.marketValue, 0);

  const totalIncome = incomes.filter(i => i.isActive).reduce((s, i) => s + toYearly(effectiveIncomeAmount(i), i.frequency), 0);
  const totalExpenses = expenses.filter(e => e.isActive).reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);
  const highInterestDebt = debts
    .filter(d => d.isActive && d.annualInterestRate > 0.08)
    .reduce((s, d) => s + d.currentBalance, 0);

  if (highInterestDebt > totalInvested / 2) {
    return {
      title: "Prioritize High-Interest Debt",
      insight: "High-interest debt (>8%) offers negative returns. Paying off this debt before aggressive investing provides better financial outcomes.",
      actionItems: [
        "Target high-interest debts for accelerated payoff",
        "Pause new investments until debt < 50% of portfolio",
        "Use freed-up cash from payoff for future investing",
      ],
      priority: "high",
      icon: "alert-triangle",
    };
  }

  const taxAdvantageRatio = safeDivide(taxAdvantaged, totalInvested);
  if (totalInvested > 0 && taxAdvantageRatio < 0.4) {
    return {
      title: "Tax-Advantaged Account Optimization",
      insight: `Only ${(taxAdvantageRatio * 100).toFixed(1)}% in tax-advantaged accounts. Maximize PVD/RMF/SSF contributions to defer taxes and accelerate wealth.`,
      actionItems: [
        "Increase PVD contributions to 15% salary",
        "Establish RMF if eligible (max 500K/year deduction)",
        "Review fund allocation for tax efficiency",
      ],
      priority: "high",
      icon: "trending-up",
    };
  }

  const ageYears = profile.dateOfBirth ? new Date().getFullYear() - parseInt(profile.dateOfBirth.split("-")[0]) : 40;
  const yearsToRetirement = Math.max(0, profile.retirementAge - ageYears);

  if (yearsToRetirement > 15 && profile.riskProfile === "conservative") {
    return {
      title: "Risk Profile Review",
      insight: `With ${yearsToRetirement} years until retirement, you may benefit from higher equity allocation (stocks). Conservative portfolios risk underperformance vs. inflation.`,
      actionItems: [
        "Assess whether risk profile matches time horizon",
        "Consider 60/40 or 70/30 stock/bond allocation",
        "Review performance annually, adjust as retirement nears",
      ],
      priority: "medium",
      icon: "trending-up",
    };
  }

  return {
    title: "Strong Investment Positioning",
    insight: "Your investment strategy appears sound. Focus on consistent contributions and periodic rebalancing to maintain alignment with your risk profile.",
    actionItems: [
      "Set up automatic monthly contributions",
      "Review and rebalance portfolio annually",
      "Track performance against relevant benchmarks",
    ],
    priority: "low",
    icon: "check-circle",
  };
}

// ─────── DEBT INSIGHTS ───────
function analyzeDebts(profileData: {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}): InsightResult {
  const { debts, incomes } = profileData;

  const activeDebts = debts.filter(d => d.isActive);
  const totalDebt = activeDebts.reduce((s, d) => s + d.currentBalance, 0);
  const monthlyPayments = activeDebts.reduce((s, d) => s + d.standardMonthlyPayment + d.extraMonthlyPayment, 0);

  const monthlyIncome = incomes
    .filter(i => i.isActive)
    .reduce((s, i) => s + toYearly(effectiveIncomeAmount(i), i.frequency) / 12, 0);

  const dsr = safeDivide(monthlyPayments, monthlyIncome); // Debt Service Ratio

  if (dsr > 0.5) {
    return {
      title: "High Debt Service Burden",
      insight: "Debt payments exceed 50% of income. This limits financial flexibility. Focus on debt reduction before taking on new commitments.",
      actionItems: [
        "Create aggressive debt payoff plan (avalanche/snowball)",
        "Redirect any bonuses/windfalls to principal",
        "Pause new large expenses until DSR < 35%",
      ],
      priority: "high",
      icon: "alert-triangle",
    };
  }

  const highInterestDebt = activeDebts
    .filter(d => d.annualInterestRate > 0.08)
    .reduce((s, d) => s + d.currentBalance, 0);

  if (highInterestDebt > 0) {
    const highInterestRatio = safeDivide(highInterestDebt, totalDebt);
    return {
      title: "High-Interest Debt Payoff Priority",
      insight: `${(highInterestRatio * 100).toFixed(1)}% of debt is high-interest (>8%). These debts compound quickly. Prioritize payoff using avalanche method.`,
      actionItems: [
        "Attack highest-rate debts first (avalanche method)",
        "Consider balance transfers to lower rates if available",
        "Increase monthly payments by 10-20% if possible",
      ],
      priority: "high",
      icon: "trending-down",
    };
  }

  if (totalDebt === 0) {
    return {
      title: "Debt-Free Status",
      insight: "Congratulations! With zero debt, focus on building wealth through investments and maintaining emergency reserves for financial resilience.",
      actionItems: [
        "Build 6-month emergency fund if not complete",
        "Redirect former debt payments to investments",
        "Plan major purchases strategically",
      ],
      priority: "low",
      icon: "check-circle",
    };
  }

  return {
    title: "Manageable Debt Level",
    insight: "Your debt level is reasonable relative to income (DSR < 35%). Continue current payoff plan and consider optimizing interest rates.",
    actionItems: [
      "Review mortgage/loan rates for refinance opportunities",
      "Set payoff timeline targets (e.g., mortgage by 2035)",
      "Monitor for early payoff opportunities",
    ],
    priority: "medium",
    icon: "trending-down",
  };
}

// ─────── SCENARIO INSIGHTS ───────
function analyzeScenarios(profileData: {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}): InsightResult {
  const { profile, incomes, expenses, debts, investments } = profileData;

  const totalIncome = incomes.filter(i => i.isActive).reduce((s, i) => s + toYearly(effectiveIncomeAmount(i), i.frequency), 0);
  const totalExpenses = expenses.filter(e => e.isActive).reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);
  const totalInvested = investments.filter(i => i.isActive).reduce((s, i) => s + i.marketValue, 0);
  const totalDebt = debts.filter(d => d.isActive).reduce((s, d) => s + d.currentBalance, 0);

  const ageYears = profile.dateOfBirth ? new Date().getFullYear() - parseInt(profile.dateOfBirth.split("-")[0]) : 40;
  const yearsToRetirement = Math.max(0, profile.retirementAge - ageYears);

  if (yearsToRetirement < 10 && totalInvested < totalDebt) {
    return {
      title: "Retirement Timeline Risk",
      insight: `${yearsToRetirement} years to retirement but assets < debt. This trajectory is unsustainable. Create aggressive payoff plan and reduce expenses.`,
      actionItems: [
        "Defer retirement if feasible (1-5 years additional work)",
        "Increase income/bonus targets by 20-30%",
        "Reduce spending by 15-25% and redirect to debt/savings",
      ],
      priority: "high",
      icon: "alert-triangle",
    };
  }

  if (yearsToRetirement >= 15) {
    return {
      title: "Long Time Horizon Opportunity",
      insight: `With ${yearsToRetirement} years until retirement, compound growth is your greatest asset. Maximize contributions and maintain disciplined investing.`,
      actionItems: [
        "Increase annual savings by 10-20%",
        "Ensure aggressive (70/30+) asset allocation",
        "Review and rebalance quarterly",
      ],
      priority: "high",
      icon: "trending-up",
    };
  }

  return {
    title: "Scenario Planning Framework Ready",
    insight: "Use scenario planning to test income shocks, market downturns, and major life changes. This helps build financial resilience.",
    actionItems: [
      "Create 'base case' scenario with realistic assumptions",
      "Test worst-case: income drops 30% for 12 months",
      "Review scenario annually as life circumstances change",
    ],
    priority: "medium",
    icon: "trending-up",
  };
}

// ─────── DEFAULT ───────
function defaultInsight(): InsightResult {
  return {
    title: "Financial Planning Insights",
    insight: "Track your income, expenses, debts, and investments to get personalized insights and recommendations.",
    actionItems: [
      "Input your financial data",
      "Review insights regularly",
      "Adjust strategy based on recommendations",
    ],
    priority: "low",
    icon: "info",
  };
}
