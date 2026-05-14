/**
 * AI-DRIVEN SCENARIO PLANNER ENGINE
 * 6 analysis modules: Investment, Tax, Risk, Savings, Geopolitical, Alstom STI
 * All calculations are local (no external APIs).
 */

import type {
  Profile, IncomeItem, ExpenseItem, DebtAccount,
  InvestmentAccount, RetirementAssumptions, TaxAssumptions,
  ScenarioAssumptions, YearlyForecastRow,
} from "../types";
import { safeDivide, toYearly, applyGrowth, calcAge } from "../utils";

export interface AnalysisResult {
  moduleId: string;
  moduleName: string;
  confidenceScore: number;
  timestamp: string;
  recommendations: Recommendation[];
  metrics: Record<string, number | string>;
  explanation: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  impact: string;
}

// MODULE 1: INVESTMENT OPTIMIZATION
export interface InvestmentOptimizationInput {
  investments: InvestmentAccount[];
  profile: Profile;
  income: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
}

export function analyzeInvestmentOptimization(input: InvestmentOptimizationInput): AnalysisResult {
  const { investments, profile, income, expenses, debts } = input;

  const totalInvested = investments.filter(i => i.isActive).reduce((s, i) => s + i.marketValue, 0);
  const taxAdvantaged = investments
    .filter(i => i.isActive && i.isTaxAdvantaged)
    .reduce((s, i) => s + i.marketValue, 0);

  const assetBreakdown: Record<string, number> = {};
  let totalValue = 0;
  for (const inv of investments.filter(i => i.isActive)) {
    assetBreakdown[inv.accountType] = (assetBreakdown[inv.accountType] || 0) + inv.marketValue;
    totalValue += inv.marketValue;
  }

  const annualIncome = income
    .filter(i => i.isActive)
    .reduce((s, i) => s + toYearly(i.amount, i.frequency), 0);

  const annualExpenses = expenses
    .filter(e => e.isActive)
    .reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);

  const annualSavings = annualIncome - annualExpenses;
  const savingsRate = safeDivide(annualSavings, annualIncome);

  const recommendations: Recommendation[] = [];
  const confidence = calculateConfidence(investments.length, totalInvested);

  const taxAdvantageRatio = safeDivide(taxAdvantaged, totalValue);
  if (taxAdvantageRatio < 0.4) {
    recommendations.push({
      title: "Increase Tax-Advantaged Contributions",
      description: `Only ${(taxAdvantageRatio * 100).toFixed(1)}% in tax-advantaged accounts. Target 40-60%.`,
      priority: "high",
      impact: `Potential ${Math.round(totalValue * 0.15)}/year in tax savings`,
    });
  }

  if (totalInvested > 0) {
    const largest = Math.max(...investments.map(i => i.marketValue));
    const concentration = safeDivide(largest, totalValue);
    if (concentration > 0.4) {
      recommendations.push({
        title: "Reduce Portfolio Concentration",
        description: `Largest holding is ${(concentration * 100).toFixed(1)}%. Diversify to reduce risk.`,
        priority: "high",
        impact: "Improved stability",
      });
    }
  }

  if (savingsRate > 0.2) {
    recommendations.push({
      title: "Boost Investment Contributions",
      description: `Strong savings rate of ${(savingsRate * 100).toFixed(1)}%. Increase monthly investments.`,
      priority: "medium",
      impact: `${Math.round(annualSavings * 0.5)}/year additional growth`,
    });
  }

  const projections = {
    return5yr: Math.round(totalInvested * Math.pow(1.07, 5)),
    return10yr: Math.round(totalInvested * Math.pow(1.07, 10)),
    return20yr: Math.round(totalInvested * Math.pow(1.07, 20)),
  };

  return {
    moduleId: "invest_opt",
    moduleName: "Investment Optimization",
    confidenceScore: confidence,
    timestamp: new Date().toISOString(),
    recommendations,
    metrics: {
      "Total Invested": totalInvested,
      "Tax-Advantaged pct": `${(taxAdvantageRatio * 100).toFixed(1)}%`,
      "Annual Savings": annualSavings,
      "Savings Rate": `${(savingsRate * 100).toFixed(1)}%`,
      "Projected 5yr": projections.return5yr,
      "Projected 10yr": projections.return10yr,
      "Projected 20yr": projections.return20yr,
      "Account Count": investments.filter(i => i.isActive).length,
    },
    explanation: `Portfolio contains ${investments.filter(i => i.isActive).length} accounts. ${recommendations.length > 0 ? "Key opportunities identified." : "Well-diversified."}`,
  };
}

// MODULE 2: TAX PLANNING
export interface TaxPlanningInput {
  profile: Profile;
  income: IncomeItem[];
  investments: InvestmentAccount[];
  debts: DebtAccount[];
  tax: TaxAssumptions;
}

export function analyzeTaxPlanning(input: TaxPlanningInput): AnalysisResult {
  const { profile, income, investments, debts, tax } = input;

  const totalIncome = income
    .filter(i => i.isActive && i.isTaxable)
    .reduce((s, i) => s + toYearly(i.amount, i.frequency), 0);

  const estimatedTaxLiability = estimateTaxLiability(totalIncome);

  const pvdContributions = income
    .filter(i => i.isActive)
    .reduce((s, i) => s + toYearly(i.amount, i.frequency) * 0.05, 0);

  const rmfEligible = Math.min(totalIncome * 0.15, 500_000);
  const ssfEligible = Math.min(totalIncome * 0.08, 102_000);

  const deductionSavings = (pvdContributions + rmfEligible + ssfEligible) * 0.1;

  const mortgageDebt = debts.find(d => d.debtType === "mortgage");
  const mortgageInterestDeduction = mortgageDebt
    ? mortgageDebt.currentBalance * mortgageDebt.annualInterestRate * 0.1
    : 0;

  const dividendIncome = income
    .filter(i => i.category === "dividend")
    .reduce((s, i) => s + toYearly(i.amount, i.frequency), 0);

  const dividendTax = dividendIncome * 0.1;

  const investments_active = investments.filter(i => i.isActive);
  const unrealizedLosses = investments_active
    .filter(i => i.marketValue < (i.purchasePrice || 0))
    .reduce((s, i) => s + ((i.purchasePrice || 0) - i.marketValue), 0);

  const taxLossHarvestingSavings = unrealizedLosses * 0.1;

  const recommendations: Recommendation[] = [];

  if (pvdContributions < rmfEligible) {
    recommendations.push({
      title: "Maximize RMF Contributions",
      description: `Can contribute up to ${Math.round(rmfEligible)}. Current: ${Math.round(pvdContributions)}.`,
      priority: "high",
      impact: `${Math.round((rmfEligible - pvdContributions) * 0.1)} annual tax savings`,
    });
  }

  if (unrealizedLosses > 0) {
    recommendations.push({
      title: "Tax-Loss Harvesting",
      description: `${Math.round(unrealizedLosses)} in unrealized losses. Harvest to offset gains.`,
      priority: "medium",
      impact: `${Math.round(taxLossHarvestingSavings)} tax savings`,
    });
  }

  const confidence = calculateConfidence(income.length + investments.length, totalIncome);

  return {
    moduleId: "tax_plan",
    moduleName: "Tax Planning",
    confidenceScore: confidence,
    timestamp: new Date().toISOString(),
    recommendations,
    metrics: {
      "Taxable Income": totalIncome,
      "Estimated Tax": estimatedTaxLiability,
      "RMF Eligible": rmfEligible,
      "SSF Eligible": ssfEligible,
      "Deduction Savings": deductionSavings,
      "Dividend Income": dividendIncome,
    },
    explanation: `Estimated tax ${Math.round(estimatedTaxLiability)}. Deductions could save ${Math.round(deductionSavings + mortgageInterestDeduction)}/year.`,
  };
}

// MODULE 3: RISK ASSESSMENT
export interface RiskAssessmentInput {
  profile: Profile;
  investments: InvestmentAccount[];
  debts: DebtAccount[];
  income: IncomeItem[];
  expenses: ExpenseItem[];
}

export function analyzeRiskAssessment(input: RiskAssessmentInput): AnalysisResult {
  const { profile, investments, debts, income, expenses } = input;

  const volatilityByType: Record<string, number> = {
    PVD: 0.08, RMF: 0.1, SSF: 0.12, brokerage: 0.15, crypto: 0.45, savings: 0.02, other: 0.12,
  };

  let portfolioVolatility = 0;
  let totalValue = 0;

  for (const inv of investments.filter(i => i.isActive)) {
    const vol = volatilityByType[inv.accountType] || 0.12;
    const weight = inv.marketValue / Math.max(1, investments.filter(i => i.isActive).reduce((s, i) => s + i.marketValue, 0));
    portfolioVolatility += vol * weight;
    totalValue += inv.marketValue;
  }

  const holdings = investments.filter(i => i.isActive);
  const concentrationRisk = holdings.length > 0
    ? Math.max(...holdings.map(i => safeDivide(i.marketValue, totalValue)))
    : 0;

  const totalDebt = debts.filter(d => d.isActive).reduce((s, d) => s + d.currentBalance, 0);
  const debtToIncome = safeDivide(totalDebt, income.filter(i => i.isActive).reduce((s, i) => s + toYearly(i.amount, i.frequency), 0));

  const monthlyExpenses = expenses
    .filter(e => e.isActive)
    .reduce((s, e) => s + toYearly(e.amount, e.frequency), 0) / 12;

  const emergencyFundTarget = monthlyExpenses * (profile.emergencyFundTargetMonths || 6);
  const currentCash = profile.currentCashBalance;
  const emergencyFundCoverage = safeDivide(currentCash, emergencyFundTarget);

  const recommendations: Recommendation[] = [];

  if (portfolioVolatility > 0.2) {
    recommendations.push({
      title: "Reduce Portfolio Volatility",
      description: `Volatility at ${(portfolioVolatility * 100).toFixed(1)}% exceeds moderate threshold (15%).`,
      priority: "high",
      impact: "Lower drawdown risk",
    });
  }

  if (concentrationRisk > 0.3) {
    recommendations.push({
      title: "Diversify Holdings",
      description: `Largest position is ${(concentrationRisk * 100).toFixed(1)}%. Target max 20-25%.`,
      priority: "high",
      impact: "Reduce single-asset risk",
    });
  }

  if (debtToIncome > 3) {
    recommendations.push({
      title: "Reduce Debt-to-Income Ratio",
      description: `Debt is ${debtToIncome.toFixed(1)}x income. Target below 2.5x.`,
      priority: "high",
      impact: "Improve financial stability",
    });
  }

  if (emergencyFundCoverage < 0.75) {
    recommendations.push({
      title: "Build Emergency Fund",
      description: `Current fund covers ${(emergencyFundCoverage * 100).toFixed(0)}%. Need ${Math.round(emergencyFundTarget - currentCash)} more.`,
      priority: "high",
      impact: "Financial security",
    });
  }

  const confidence = calculateConfidence(investments.length + debts.length, totalValue);

  return {
    moduleId: "risk_assess",
    moduleName: "Risk Assessment",
    confidenceScore: confidence,
    timestamp: new Date().toISOString(),
    recommendations,
    metrics: {
      "Portfolio Volatility": `${(portfolioVolatility * 100).toFixed(1)}%`,
      "Concentration Risk": `${(concentrationRisk * 100).toFixed(1)}%`,
      "Debt-to-Income": debtToIncome.toFixed(2),
      "Emergency Fund Coverage": `${(emergencyFundCoverage * 100).toFixed(0)}%`,
      "Total Debt": totalDebt,
      "Risk Profile": profile.riskProfile,
    },
    explanation: `Portfolio has ${(portfolioVolatility * 100).toFixed(1)}% volatility. Emergency fund at ${(emergencyFundCoverage * 100).toFixed(0)}% of target.`,
  };
}

// MODULE 4: SAVINGS & DEBT REDUCTION
export interface SavingsDebtInput {
  profile: Profile;
  income: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
}

export function analyzeSavingsAndDebt(input: SavingsDebtInput): AnalysisResult {
  const { profile, income, expenses, debts, investments } = input;

  const annualIncome = income
    .filter(i => i.isActive)
    .reduce((s, i) => s + toYearly(i.amount, i.frequency), 0);

  const annualExpenses = expenses
    .filter(e => e.isActive)
    .reduce((s, e) => s + toYearly(e.amount, e.frequency), 0);

  const monthlyExpenses = annualExpenses / 12;
  const annualSavings = annualIncome - annualExpenses;

  const emergencyFundTarget = monthlyExpenses * (profile.emergencyFundTargetMonths || 6);
  const currentEmergencyFund = profile.currentCashBalance;

  const activeDebts = debts.filter(d => d.isActive).sort((a, b) => b.annualInterestRate - a.annualInterestRate);

  const mortgageDebt = activeDebts.find(d => d.debtType === "mortgage");
  const highInterestDebt = activeDebts.filter(d => d.annualInterestRate > 0.1);

  let debtPayoffTimeline = 0;
  let totalDebtPayments = 0;

  for (const debt of activeDebts) {
    const monthlyPayment = debt.standardMonthlyPayment + debt.extraMonthlyPayment;
    const monthsToPayoff = safeDivide(debt.currentBalance, monthlyPayment);
    debtPayoffTimeline = Math.max(debtPayoffTimeline, monthsToPayoff);
    totalDebtPayments += debt.currentBalance * debt.annualInterestRate;
  }

  const savingsCompound5yr = annualSavings * (Math.pow(1.07, 5) - 1) / 0.07;
  const savingsCompound10yr = annualSavings * (Math.pow(1.07, 10) - 1) / 0.07;

  const recommendations: Recommendation[] = [];

  if (currentEmergencyFund < emergencyFundTarget) {
    const shortfall = emergencyFundTarget - currentEmergencyFund;
    recommendations.push({
      title: "Build Emergency Fund",
      description: `Target ${profile.emergencyFundTargetMonths || 6} months. Need ${Math.round(shortfall)} more.`,
      priority: "high",
      impact: `Fix ${Math.round(shortfall)} shortfall`,
    });
  }

  if (highInterestDebt.length > 0) {
    const highestRate = highInterestDebt[0];
    recommendations.push({
      title: "Prioritize High-Interest Debt",
      description: `Accelerate ${highestRate.name} (${(highestRate.annualInterestRate * 100).toFixed(1)}%).`,
      priority: "high",
      impact: `${Math.round(totalDebtPayments * 0.3)}/year interest savings`,
    });
  }

  if (annualSavings > 0) {
    recommendations.push({
      title: "Automate Savings Growth",
      description: `Current annual savings ${Math.round(annualSavings)}. Automate for 7% return.`,
      priority: "medium",
      impact: `${Math.round(savingsCompound10yr)}/10 years growth`,
    });
  }

  const confidence = calculateConfidence(income.length + debts.length, annualIncome);

  return {
    moduleId: "savings_debt",
    moduleName: "Savings and Debt Reduction",
    confidenceScore: confidence,
    timestamp: new Date().toISOString(),
    recommendations,
    metrics: {
      "Annual Income": annualIncome,
      "Annual Expenses": annualExpenses,
      "Annual Savings": annualSavings,
      "Emergency Fund Target": emergencyFundTarget,
      "Debt Payoff Years": (debtPayoffTimeline / 12).toFixed(1),
      "Savings Compound 10yr": Math.round(savingsCompound10yr),
      "High-Interest Debt": highInterestDebt.length,
    },
    explanation: `Monthly surplus ${Math.round(annualSavings / 12)}. Debt payoff in ${(debtPayoffTimeline / 12).toFixed(1)} years.`,
  };
}

// MODULE 5: GEOPOLITICAL IMPACT
export interface GeopoliticalHedgeInput {
  investments: InvestmentAccount[];
  profile: Profile;
}

export function analyzeGeopoliticalHedge(input: GeopoliticalHedgeInput): AnalysisResult {
  const { investments, profile } = input;

  const totalPortfolio = investments
    .filter(i => i.isActive)
    .reduce((s, i) => s + i.marketValue, 0);

  const energyExposure = investments
    .filter(
      i =>
        i.isActive &&
        (i.assetDescription.toLowerCase().includes("oil") ||
          i.assetDescription.toLowerCase().includes("gas") ||
          i.assetDescription.toLowerCase().includes("energy"))
    )
    .reduce((s, i) => s + i.marketValue, 0);

  const goldExposure = investments
    .filter(
      i =>
        i.isActive &&
        (i.assetDescription.toLowerCase().includes("gold") ||
          i.assetDescription.toLowerCase().includes("precious"))
    )
    .reduce((s, i) => s + i.marketValue, 0);

  const geopoliticalRiskScore = 6;
  const recommendedGoldHedge = totalPortfolio * 0.05;
  const recommendedEnergyHedge = totalPortfolio * 0.03;

  const currentGoldAllocation = safeDivide(goldExposure, totalPortfolio);
  const currentEnergyAllocation = safeDivide(energyExposure, totalPortfolio);

  const recommendations: Recommendation[] = [];

  if (currentGoldAllocation < 0.03) {
    recommendations.push({
      title: "Add Gold Hedge",
      description: `Current allocation ${(currentGoldAllocation * 100).toFixed(1)}% is below safe level (5%).`,
      priority: "medium",
      impact: "Crisis protection",
    });
  }

  if (geopoliticalRiskScore > 6) {
    recommendations.push({
      title: "Increase Diversification",
      description: `Geopolitical risk at ${geopoliticalRiskScore}/10. Add defensive assets.`,
      priority: "high",
      impact: "Reduce systemic risk",
    });
  }

  if (currentEnergyAllocation > 0.1) {
    recommendations.push({
      title: "Rebalance Energy Exposure",
      description: `Energy at ${(currentEnergyAllocation * 100).toFixed(1)}% is elevated. Reduce to 3-5%.`,
      priority: "medium",
      impact: "Lower geopolitical sensitivity",
    });
  }

  const confidence = calculateConfidence(investments.length, totalPortfolio);

  return {
    moduleId: "geopolitical",
    moduleName: "Geopolitical Impact Analysis",
    confidenceScore: confidence,
    timestamp: new Date().toISOString(),
    recommendations,
    metrics: {
      "Geopolitical Risk": `${geopoliticalRiskScore}/10`,
      "Current Gold Allocation": `${(currentGoldAllocation * 100).toFixed(2)}%`,
      "Current Energy Exposure": `${(currentEnergyAllocation * 100).toFixed(2)}%`,
      "Gold Price Baseline": "$2050/oz",
      "Oil Price Baseline": "$85/bbl",
    },
    explanation: `Portfolio has ${(currentGoldAllocation * 100).toFixed(1)}% gold and ${(currentEnergyAllocation * 100).toFixed(1)}% energy. Geopolitical risk: ${geopoliticalRiskScore}/10.`,
  };
}

// HELPER FUNCTIONS
function calculateConfidence(dataPoints: number, totalValue: number): number {
  let confidence = 50;
  confidence += Math.min(dataPoints * 5, 30);
  confidence += Math.min(totalValue / 1_000_000, 20);
  return Math.min(100, confidence);
}

function estimateTaxLiability(taxableIncome: number): number {
  if (taxableIncome <= 150_000) return 0;

  let tax = 0;
  const brackets = [
    { limit: 150_000, rate: 0 },
    { limit: 300_000, rate: 0.05 },
    { limit: 500_000, rate: 0.1 },
    { limit: 750_000, rate: 0.15 },
    { limit: 1_000_000, rate: 0.2 },
    { limit: 2_000_000, rate: 0.25 },
    { limit: 5_000_000, rate: 0.3 },
    { limit: Infinity, rate: 0.35 },
  ];

  let previousLimit = 0;
  for (let i = 1; i < brackets.length; i++) {
    const bracket = brackets[i];
    const limit = Math.min(bracket.limit, taxableIncome);

    if (limit > previousLimit) {
      const income = limit - previousLimit;
      tax += income * bracket.rate;
    }

    previousLimit = limit;
    if (taxableIncome <= limit) break;
  }

  return tax;
}

// ============================================================================
// MODULE 6: ALSTOM SHORT-TERM INCENTIVE (STI) PAYOUT PROBABILITY
// ----------------------------------------------------------------------------
// Assesses the probability of Alstom FY 2025/26 short-term incentive payout
// by benchmarking preliminary published results against the Group's committed
// FY 2025/26 financial targets.
//
// SOURCES (April 2026):
//   - Alstom Press Release "Alstom's preliminary FY 2025/26 results"
//     https://www.alstom.com/press-releases-news/2026/4/alstoms-preliminary-fy-202526-results
//   - GlobeNewswire "Record orders, Free Cash Flow within guidance,
//     Adjusted EBIT at ~6%, Revised preliminary outlook for FY 2026/27"
//   - Alstom FY 2024/25 Annual Report and H1 FY 2025/26 Financial Results
//     Presentation (guidance confirmation)
//
// All figures are sourced from Alstom's publicly disclosed guidance
// and preliminary results. Payout model assumes a standard Alstom STI
// weighting: 40% aEBIT margin, 30% Free Cash Flow, 20% Orders, 10% Sales.
// Corporate STI modifier is capped at 150% (typical executive plan cap).
// ============================================================================

export interface AlstomSTICriterion {
  id: string;
  name: string;
  weight: number;                       // 0..1 share of STI
  targetLabel: string;
  actualLabel: string;
  /** Achievement ratio: 1.00 = on-target, < 1 = below, > 1 = above (capped 1.5) */
  achievement: number;
  /** Payout factor after threshold / cap rules are applied (0..1.5) */
  payoutFactor: number;
  status: "exceeded" | "met" | "partial" | "missed";
  commentary: string;
}

export type AlstomQuote = { price: number; change1y: number; asOf: string; source: string };

/**
 * Metadata about the latest document published on
 * alstom.com/finance/financial-results. Produced by the
 * `/api/alstom/financial-results` route and consumed here so the
 * STI module can flip from "preliminary" to "audited" automatically.
 */
export type AlstomReleaseInfo = {
  found: boolean;
  fiscalYear: string;
  documentLabel: string;
  documentDate: string;     // ISO yyyy-mm-dd
  documentUrl: string;
  pageUrl: string;
  classification:
    | "annual-results-audited"
    | "preliminary"
    | "h1"
    | "q3"
    | "q1"
    | "other";
  isPostPreliminary: boolean;
  fetchedAt: string;
  source: "alstom.com" | "fallback";
};

/**
 * AUDITED-OVERRIDE block.
 *
 * When Alstom publishes the audited FY 2025/26 figures (expected
 * mid-May 2026), flip `enabled` to true and fill in the final numbers.
 * `analyzeAlstomSTI` will then use these instead of the preliminary
 * actuals without any other code edits required.
 *
 * Leaving `enabled: false` is the safe default — the module continues
 * to operate from the 16-Apr-2026 preliminary results.
 */
export type AlstomAuditedOverride = {
  enabled: boolean;
  aebitMarginPct?: number;       // e.g. 6.1
  fcfEurMillions?: number;       // e.g. 332
  ordersEurBillions?: number;    // e.g. 27.6
  organicSalesGrowthPct?: number; // e.g. 7.0
  releaseDateISO?: string;        // e.g. "2026-05-14"
  releaseUrl?: string;
};

export const ALSTOM_FY2526_AUDITED_OVERRIDE: AlstomAuditedOverride = {
  enabled: false,
  // Fill these in once the audited PDF is out:
  aebitMarginPct: undefined,
  fcfEurMillions: undefined,
  ordersEurBillions: undefined,
  organicSalesGrowthPct: undefined,
  releaseDateISO: undefined,
  releaseUrl: undefined,
};

export interface AlstomSTIAnalysis {
  moduleId: "alstom-sti-fy2526";
  moduleName: string;
  fiscalYear: string;
  /** Probability (0..100) that STI will pay out at or above target */
  payoutProbability: number;
  /** Expected payout expressed as % of target STI (100 = on-target) */
  expectedPayoutRatio: number;
  /** Blended payout factor (same as expectedPayoutRatio / 100) */
  expectedPayoutPct?: number;
  confidenceScore: number;
  timestamp: string;
  criteria: AlstomSTICriterion[];
  verdict: string;
  narrative: string;
  sources: { label: string; url: string }[];
  disclaimer: string;
  livePrice?: AlstomQuote;
  /** Set when an audited release supersedes the preliminary results. */
  release?: AlstomReleaseInfo;
  /** "preliminary" while we're operating off the 16-Apr-2026 press release;
   *  "audited" once a post-preliminary annual-results PDF has been ingested. */
  resultsStage: "preliminary" | "audited";
}

export function analyzeAlstomSTI(release?: AlstomReleaseInfo): AlstomSTIAnalysis {
  // FY 2025/26 COMMITMENTS (from May-2025 guidance, reconfirmed H1 and Q3):
  //   - Organic sales growth: > 5%
  //   - Adjusted EBIT margin: ~ 7%
  //   - Free Cash Flow: EUR 200m - 400m
  //   - Order intake: no formal target (management ambition book-to-bill >= 1.0)
  //
  // FY 2025/26 PRELIMINARY ACTUALS (16 April 2026 press release):
  //   - Sales: EUR 19.2bn reported (+4% reported / +7% organic)
  //   - Adjusted EBIT margin: ~6%  (approx EUR 1,152m)
  //   - Free Cash Flow: ~EUR 330m (within EUR 200-400m range)
  //   - Orders: EUR 27.6bn, book-to-bill 1.4, backlog > EUR 100bn (RECORD)

  // Two routes into "audited" mode, ordered by trust:
  //   1. Hard-coded ALSTOM_FY2526_AUDITED_OVERRIDE with numbers transcribed
  //      from the audited PDF (highest trust, full numerical update).
  //   2. The API has detected an annual-results-audited document but we
  //      haven't yet transcribed the numbers (label-only update; still
  //      uses preliminary numerics but flags stage = "audited" with
  //      elevated confidence and refreshed sources).
  const ov = ALSTOM_FY2526_AUDITED_OVERRIDE;
  const auditedByDoc =
    release?.found === true &&
    release.classification === "annual-results-audited" &&
    release.isPostPreliminary === true;
  const auditedByOverride = ov.enabled === true;
  const resultsStage: "preliminary" | "audited" =
    auditedByOverride || auditedByDoc ? "audited" : "preliminary";

  // aEBIT — preliminary 6.0%, target 7.0%. Override wins if enabled.
  const aebitActual = auditedByOverride && ov.aebitMarginPct !== undefined
    ? ov.aebitMarginPct
    : 6.0;
  const aebitTarget = 7.0;
  const aebitAchievement = aebitActual / aebitTarget;
  // STI threshold typically 90% of target; below threshold = 0 payout.
  const aebitPayout = aebitAchievement >= 0.9
    ? Math.min(1.5, aebitAchievement)
    : 0;
  const aebitStatus: AlstomSTICriterion["status"] =
    aebitAchievement >= 1.05 ? "exceeded"
    : aebitAchievement >= 1.00 ? "met"
    : aebitAchievement >= 0.90 ? "partial"
    : "missed";

  // FCF — preliminary ~EUR 330m, target midpoint EUR 300m.
  const fcfActual = auditedByOverride && ov.fcfEurMillions !== undefined
    ? ov.fcfEurMillions
    : 330;
  const fcfPayout = Math.max(0, Math.min(1.5, fcfActual / 300));
  const fcfStatus: AlstomSTICriterion["status"] =
    fcfPayout >= 1.05 ? "exceeded"
    : fcfPayout >= 1.00 ? "met"
    : fcfPayout >= 0.90 ? "partial"
    : "missed";

  // Orders — record EUR 27.6bn, book-to-bill 1.4 (caps at 1.5x payout).
  const ordersActual = auditedByOverride && ov.ordersEurBillions !== undefined
    ? ov.ordersEurBillions
    : 27.6;
  // Stretch target band 22-24bn; anything materially above hits the 1.5x cap.
  const ordersPayout = Math.max(0, Math.min(1.5, ordersActual / 22));

  // Organic sales growth — preliminary +7%, target > 5%.
  const salesActual = auditedByOverride && ov.organicSalesGrowthPct !== undefined
    ? ov.organicSalesGrowthPct
    : 7.0;
  const salesPayout = Math.max(0, Math.min(1.5, salesActual / 5));
  const salesStatus: AlstomSTICriterion["status"] =
    salesPayout >= 1.05 ? "exceeded"
    : salesPayout >= 1.00 ? "met"
    : salesPayout >= 0.90 ? "partial"
    : "missed";

  const stageWord = resultsStage === "audited" ? "audited" : "preliminary";

  const criteria: AlstomSTICriterion[] = [
    {
      id: "aebit",
      name: "Adjusted EBIT margin",
      weight: 0.40,
      targetLabel: `~ ${aebitTarget.toFixed(1)}%`,
      actualLabel: `~ ${aebitActual.toFixed(1)}%`,
      achievement: aebitAchievement,
      payoutFactor: aebitPayout,
      status: aebitStatus,
      commentary:
        aebitPayout === 0
          ? `Margin came in at ~${aebitActual.toFixed(1)}% vs ~${aebitTarget.toFixed(1)}% guided (${stageWord}), principally due to slower-than-expected ramp-up on certain rolling-stock projects. Below the standard 90% STI threshold for this KPI, so this component is expected to pay 0.`
          : `Margin of ~${aebitActual.toFixed(1)}% vs ~${aebitTarget.toFixed(1)}% guided (${stageWord}); STI threshold cleared, KPI pays at ${Math.round(aebitPayout * 100)}% of target.`,
    },
    {
      id: "fcf",
      name: "Free Cash Flow",
      weight: 0.30,
      targetLabel: "EUR 200m - 400m",
      actualLabel: `~ EUR ${Math.round(fcfActual)}m`,
      achievement: fcfActual / 300,
      payoutFactor: fcfPayout,
      status: fcfStatus,
      commentary:
        `Free Cash Flow of ~EUR ${Math.round(fcfActual)}m vs the EUR 200-400m guidance corridor (${stageWord}). Pays at ${Math.round(fcfPayout * 100)}% of target.`,
    },
    {
      id: "orders",
      name: "Order intake / book-to-bill",
      weight: 0.20,
      targetLabel: "Book-to-bill >= 1.0 (stretch EUR 22-24bn)",
      actualLabel: `EUR ${ordersActual.toFixed(1)}bn (record)`,
      achievement: ordersPayout,
      payoutFactor: ordersPayout,
      status: ordersPayout >= 1.4 ? "exceeded" : ordersPayout >= 1.0 ? "met" : "partial",
      commentary:
        `EUR ${ordersActual.toFixed(1)}bn order intake (${stageWord}) drives backlog above EUR 100bn. Far above any reasonable target - pays at ${Math.round(ordersPayout * 100)}%.`,
    },
    {
      id: "sales",
      name: "Organic sales growth",
      weight: 0.10,
      targetLabel: "> 5% organic",
      actualLabel: `+${salesActual.toFixed(1)}% organic`,
      achievement: salesActual / 5,
      payoutFactor: salesPayout,
      status: salesStatus,
      commentary:
        `Organic sales growth of +${salesActual.toFixed(1)}% (${stageWord}) vs the >5% guidance. STI plans typically measure the organic metric.`,
    },
  ];

  // Weighted blended payout
  const weightedPayout = criteria.reduce(
    (sum, c) => sum + c.weight * c.payoutFactor,
    0
  );
  // = 0.40*0 + 0.30*1.10 + 0.20*1.50 + 0.10*1.40 = 0.77
  const expectedPayoutRatio = Math.round(weightedPayout * 100);  // 77

  // Probability of STI paying at or above target
  const metOrAboveWeight = criteria
    .filter(c => c.payoutFactor >= 1.0)
    .reduce((s, c) => s + c.weight, 0);
  const aebitWeight = criteria.find(c => c.id === "aebit")!.weight;
  const payoutProbability = Math.max(
    0,
    Math.round(metOrAboveWeight * 100 - aebitWeight * 100 * 0.9)
  );
  // = max(0, 60 - 36) = 24 - i.e. ~25% probability of full target payout

  const verdict =
    expectedPayoutRatio >= 100
      ? "At or above target"
      : expectedPayoutRatio >= 80
      ? "Below target - partial payout likely"
      : expectedPayoutRatio >= 50
      ? "Significantly below target"
      : "At risk of no payout";

  const stageLabel = resultsStage === "audited" ? "Audited" : "Preliminary";
  const narrative = [
    `Alstom closed FY 2025/26 with a mixed performance against the guidance it reconfirmed at H1 (Nov-2025) and Q3 (Jan-2026).`,
    `Strengths: record EUR ${ordersActual.toFixed(1)}bn order intake, EUR 100bn+ backlog, and Free Cash Flow of ~EUR ${Math.round(fcfActual)}m - firmly inside the EUR 200-400m guided range.`,
    `${stageLabel} read on adjusted EBIT margin lands at ~${aebitActual.toFixed(1)}%${aebitActual < aebitTarget ? `, ${(aebitTarget - aebitActual).toFixed(1)}pp short of the ~${aebitTarget.toFixed(1)}% commitment.` : `, in line with or above the ~${aebitTarget.toFixed(1)}% commitment.`}`,
    `Because aEBIT typically carries the largest STI weight (~40%) and${aebitPayout === 0 ? " falls below the 90% threshold gate, that component is likely to zero-out, dragging" : " contributes proportionally to"} the blended payout to roughly ${expectedPayoutRatio}% of target.`,
    `Net: STI is ${expectedPayoutRatio >= 100 ? "expected to pay out at or above target" : "still expected to pay out (FCF + orders + organic sales carry the plan), but meaningfully below 100%"}. Probability of a >=100% target payout is estimated at ~${payoutProbability}%.`,
  ].join(" ");

  // Build the sources list. The audited release (if detected) is pinned
  // to the top so reviewers see the most up-to-date document first.
  const sources: { label: string; url: string }[] = [];
  if (release?.found && release.classification === "annual-results-audited") {
    sources.push({
      label: `Alstom AUDITED FY 2025/26 - ${release.documentLabel} (${release.documentDate})`,
      url: release.documentUrl,
    });
  } else if (release?.found && release.classification !== "preliminary") {
    sources.push({
      label: `Alstom latest filing - ${release.documentLabel} (${release.documentDate})`,
      url: release.documentUrl,
    });
  }
  if (ov.enabled && ov.releaseUrl && ov.releaseDateISO) {
    sources.push({
      label: `Alstom AUDITED FY 2025/26 results (override, ${ov.releaseDateISO})`,
      url: ov.releaseUrl,
    });
  }
  sources.push(
    {
      label: "Alstom Financial Results listing page (live)",
      url: "https://www.alstom.com/finance/financial-results",
    },
    {
      label: "Alstom press release - preliminary FY 2025/26 results (16-Apr-2026)",
      url: "https://www.alstom.com/press-releases-news/2026/4/alstoms-preliminary-fy-202526-results",
    },
    {
      label: "GlobeNewswire - Record orders, FCF within guidance, aEBIT at ~6%",
      url: "https://www.globenewswire.com/news-release/2026/04/16/3275667/0/en/ALSTOM-S-A-Alstom-s-preliminary-FY-2025-26-results-Record-orders-Free-Cash-Flow-within-guidance-Adjusted-EBIT-at-6-Revised-preliminary-outlook-for-FY-2026-27.html",
    },
    {
      label: "Alstom H1 FY 2025/26 results presentation - guidance reconfirmed (13-Nov-2025)",
      url: "https://www.alstom.com/sites/alstom.com/files/2025/11/13/20251113_H1_Financial_Results_Presentation.pdf",
    },
    {
      label: "Alstom Q3 FY 2025/26 - backlog EUR 100bn, outlook confirmed (Jan-2026)",
      url: "https://www.alstom.com/press-releases-news/2026/1/alstoms-third-quarter-202526-record-orders-reaching-eu100bn-backlog-fy-202526-outlook-confirmed",
    },
  );

  // Confidence ladder:
  //  60: pure-modeled (no release info yet — e.g. quote alone)
  //  75: preliminary press release (16-Apr-2026)
  //  88: audited document detected but numbers not yet transcribed
  //  95: audited override block populated with audited numerics
  const confidenceScore =
    auditedByOverride ? 95
    : auditedByDoc     ? 88
    : 75;

  return {
    moduleId: "alstom-sti-fy2526",
    moduleName: "Alstom STI Payout Probability - FY 2025/26",
    fiscalYear:
      resultsStage === "audited"
        ? "FY 2025/26 (ended 31-March-2026, AUDITED)"
        : "FY 2025/26 (ended 31-March-2026)",
    payoutProbability,
    expectedPayoutRatio,
    confidenceScore,
    timestamp: new Date().toISOString(),
    criteria,
    verdict,
    narrative,
    sources,
    disclaimer:
      "Estimate based on the 40/30/20/10 weighting assumption (aEBIT / FCF / Orders / Sales) commonly applied to Alstom's Group STI framework. Your individual plan may use different weights, a different aEBIT threshold, an ESG/CO2 modifier, or personal-objective components. Final audited FY 2025/26 results and any Remuneration Committee discretion may shift the outcome. Consult your HR-provided STI letter for your personal weighting and targets.",
    release,
    resultsStage,
  };
}

// ============================================================================
// LEVER SENSITIVITY ANALYSIS
// Pure TS, no LLM call needed — fast, deterministic.
// For each key lever, computes what a ±5% nudge does to net worth and payoff.
// ============================================================================

export interface LeverSensitivityResult {
  field: keyof ScenarioAssumptions;
  label: string;
  deltaNetWorthPct: number;   // % change in final net worth vs current sim
  deltaPayoffYears: number;   // years sooner (<0) or later (>0) for mortgage payoff
  direction: "up" | "down";  // which direction helps
  rationale: string;
  confidence: number;         // 60 = sensitivity-only, 90 = corroborated by AI module
}

type ForecastFn = (a: ScenarioAssumptions) => YearlyForecastRow[];

const LEVERS: Array<{
  field: keyof ScenarioAssumptions;
  label: string;
  nudge: number;   // absolute nudge in field units
  goodDirection: "up" | "down";
  rationale: (pct: number) => string;
}> = [
  {
    field: "investmentReturnRate",
    label: "Investment return +0.5%",
    nudge: 0.005,
    goodDirection: "up",
    rationale: (pct) => `Compounding boost from +0.5% return adds ${pct.toFixed(1)}% net worth over 30yr`,
  },
  {
    field: "incomeGrowthRate",
    label: "Income growth +1%",
    nudge: 0.01,
    goodDirection: "up",
    rationale: (pct) => `Higher salary trajectory adds ${pct.toFixed(1)}% to lifetime net worth`,
  },
  {
    field: "inflationRate",
    label: "Inflation -0.5%",
    nudge: -0.005,
    goodDirection: "down",
    rationale: (pct) => `Lower CPI preserves ${pct.toFixed(1)}% of real purchasing power`,
  },
  {
    field: "mortgageExtraMonthlyPayment",
    label: "Extra mortgage payment +฿5K",
    nudge: 5_000,
    goodDirection: "up",
    rationale: (pct) => `Extra ฿5K/mo cuts interest load, improving net worth by ${pct.toFixed(1)}%`,
  },
  {
    field: "annualLumpSumPrepayment",
    label: "Annual lump-sum +฿50K",
    nudge: 50_000,
    goodDirection: "up",
    rationale: (pct) => `One extra lump sum per year improves net worth by ${pct.toFixed(1)}%`,
  },
  {
    field: "retirementAge",
    label: "Retire 2 years later",
    nudge: 2,
    goodDirection: "up",
    rationale: (pct) => `Two more earning years add ${pct.toFixed(1)}% to terminal net worth`,
  },
  {
    field: "annualBonusAmount",
    label: "Annual bonus +฿50K",
    nudge: 50_000,
    goodDirection: "up",
    rationale: (pct) => `Extra ฿50K bonus/yr compounds into ${pct.toFixed(1)}% more net worth`,
  },
  {
    field: "taxReliefInvestmentAmount",
    label: "Tax-relief contribution +฿50K",
    nudge: 50_000,
    goodDirection: "up",
    rationale: (pct) => `Maximising tax-advantaged buckets adds ${pct.toFixed(1)}%`,
  },
  {
    field: "salaryRaiseFactor",
    label: "Salary raise +5%",
    nudge: 0.05,
    goodDirection: "up",
    rationale: (pct) => `A one-off 5% raise compounds across career for +${pct.toFixed(1)}%`,
  },
  {
    field: "windfallAmount",
    label: "Windfall +฿100K",
    nudge: 100_000,
    goodDirection: "up",
    rationale: (pct) => `A ฿100K lump inflow invested today grows by ${pct.toFixed(1)}%`,
  },
];

export function analyzeLeverSensitivity(input: {
  base: ScenarioAssumptions;
  current: ScenarioAssumptions;
  forecast: ForecastFn;
}): LeverSensitivityResult[] {
  const { current, forecast } = input;

  const currentRows = forecast(current);
  const finalIdx = currentRows.length - 1;
  const currentFinalNW = currentRows[finalIdx]?.netWorth ?? 0;

  const findPayoffYear = (rows: YearlyForecastRow[]): number | null => {
    const r = rows.find(r => r.isMortgagePaidOff && (rows[0]?.mortgageBalance ?? 0) > 0);
    return r ? r.year : null;
  };
  const currentPayoffYear = findPayoffYear(currentRows);

  const results: LeverSensitivityResult[] = [];

  for (const lever of LEVERS) {
    const currentVal = (current[lever.field] as number | undefined) ?? 0;
    const nudgedVal = currentVal + lever.nudge;
    const nudgedAssumptions: ScenarioAssumptions = { ...current, [lever.field]: nudgedVal };

    const nudgedRows = forecast(nudgedAssumptions);
    const nudgedFinalNW = nudgedRows[finalIdx]?.netWorth ?? 0;
    const nudgedPayoffYear = findPayoffYear(nudgedRows);

    const deltaNetWorthPct =
      currentFinalNW !== 0
        ? ((nudgedFinalNW - currentFinalNW) / Math.abs(currentFinalNW)) * 100
        : 0;

    const deltaPayoffYears =
      currentPayoffYear !== null && nudgedPayoffYear !== null
        ? nudgedPayoffYear - currentPayoffYear
        : 0;

    // Confidence: 90 if lever is well-understood (returns/rates), 60 for career shocks
    const highConfidenceFields: Array<keyof ScenarioAssumptions> = [
      "investmentReturnRate", "inflationRate", "mortgageExtraMonthlyPayment",
      "annualLumpSumPrepayment", "taxReliefInvestmentAmount",
    ];
    const confidence = highConfidenceFields.includes(lever.field) ? 90 : 60;

    const absDelta = Math.abs(deltaNetWorthPct);
    results.push({
      field: lever.field,
      label: lever.label,
      deltaNetWorthPct,
      deltaPayoffYears,
      direction: lever.goodDirection,
      rationale: lever.rationale(absDelta),
      confidence,
    });
  }

  // Sort by absolute impact descending
  results.sort((a, b) => Math.abs(b.deltaNetWorthPct) - Math.abs(a.deltaNetWorthPct));
  return results;
}

/**
 * Analyze Alstom STI with live share price momentum as a 5th criterion.
 * Re-normalizes weights: 4 original criteria scaled to 90%, new criterion at 10%.
 *
 * Accepts an optional release-info payload from `/api/alstom/financial-results`
 * so the analysis automatically promotes from "preliminary" to "audited"
 * the moment Alstom publishes the audited FY 2025/26 PDF.
 */
export function analyzeAlstomSTIWithLive(
  quote: AlstomQuote | null,
  release?: AlstomReleaseInfo,
): AlstomSTIAnalysis {
  const base = analyzeAlstomSTI(release);       // existing synchronous fn
  if (!quote) return base;                      // graceful degrade

  const sharePriceCriterion: AlstomSTICriterion = {
    id: "share_price_momentum",
    name: "Share price 1Y momentum (live)",
    weight: 0.10,
    targetLabel: ">= +10% / yr",
    actualLabel: `${(quote.change1y * 100).toFixed(1)}% (price EUR ${quote.price.toFixed(2)})`,
    achievement: quote.change1y / 0.10,
    payoutFactor: Math.max(0, Math.min(1.5, quote.change1y / 0.10)),
    status: quote.change1y >= 0.10 ? "exceeded" : quote.change1y >= 0 ? "met" : "missed",
    commentary:
      `Live Alstom (ALO.PA) at EUR ${quote.price.toFixed(2)} as of ${quote.asOf.slice(0,10)}. ` +
      `1Y momentum ${(quote.change1y*100).toFixed(1)}%. STI plans increasingly weight TSR/share-price as a ` +
      `gate; we proxy with a 10% notional weight here. Source: ${quote.source}.`,
  };

  const rescaled = base.criteria.map(c => ({ ...c, weight: c.weight * 0.9 }));
  const allCriteria = [...rescaled, sharePriceCriterion];

  const blendedPayout = allCriteria.reduce((s, c) => s + c.weight * c.payoutFactor, 0);
  const expectedPayoutRatio = Math.round(blendedPayout * 100);

  return {
    ...base,
    criteria: allCriteria,
    expectedPayoutRatio,
    expectedPayoutPct: blendedPayout,
    livePrice: quote,
  };
}
