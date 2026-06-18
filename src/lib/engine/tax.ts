/**
 * THAILAND TAX ENGINE
 * ────────────────────
 * Computes estimated personal income tax under Thailand's progressive brackets.
 *
 * 2024 Thailand PIT brackets (taxable income in THB):
 *   0       –   150,000  →  0%
 *   150,001 –   300,000  →  5%
 *   300,001 –   500,000  →  10%
 *   500,001 –   750,000  →  15%
 *   750,001 – 1,000,000  →  20%
 *  1,000,001 – 2,000,000 →  25%
 *  2,000,001 – 5,000,000 →  30%
 *  5,000,001+             →  35%
 *
 * Key deductions:
 *   - Personal allowance: 60,000
 *   - Employment income deduction: 50% of income, max 100,000
 *   - PVD: full contribution (max 15% of salary, max 500,000)
 *   - RMF: up to 30% of taxable income, max 500,000 (combined SSF/RMF/PVD ≤ 500,000)
 *   - SSF: up to 30% of taxable income, max 200,000
 *   - Life insurance: max 100,000
 *   - Health insurance: max 25,000
 *   - Mortgage interest: max 100,000
 *   - Parental deduction: 30,000 per parent (max 2)
 *   - Child deduction: 30,000 per child (2nd+ 60,000)
 */

import type { TaxAssumptions, IncomeItem } from "../types";
import { effectiveIncomeAmount } from "../utils";

const BRACKETS = [
  { limit: 150_000, rate: 0 },
  { limit: 300_000, rate: 0.05 },
  { limit: 500_000, rate: 0.10 },
  { limit: 750_000, rate: 0.15 },
  { limit: 1_000_000, rate: 0.20 },
  { limit: 2_000_000, rate: 0.25 },
  { limit: 5_000_000, rate: 0.30 },
  { limit: Infinity, rate: 0.35 },
];

export function calcThaiTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let remaining = taxableIncome;
  let previousLimit = 0;

  for (const bracket of BRACKETS) {
    const bracketSize = bracket.limit - previousLimit;
    const taxableInBracket = Math.min(remaining, bracketSize);
    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
    previousLimit = bracket.limit;
    if (remaining <= 0) break;
  }
  return Math.max(0, tax);
}

export interface TaxResult {
  grossIncome: number;
  employmentDeduction: number;
  pvdDeduction: number;
  rmfDeduction: number;
  ssfDeduction: number;
  lifeInsuranceDeduction: number;
  healthInsuranceDeduction: number;
  mortgageInterestDeduction: number;
  parentalDeduction: number;
  childDeduction: number;
  otherDeductions: number;
  personalAllowance: number;
  totalDeductions: number;
  taxableIncome: number;
  estimatedTax: number;
  effectiveTaxRate: number;
  marginalRate: number;
  // Planning metrics
  taxSavedByRMF: number;
  taxSavedByPVD: number;
  additionalRMFRoom: number;   // more you can contribute to save tax
  additionalSSFRoom: number;
}

export function computeTax(t: TaxAssumptions): TaxResult {
  const grossIncome = t.annualGrossIncome + t.annualBonus;

  // --- Deductions ---
  // Employment income deduction: 50% of income, max 100,000
  const employmentDeduction = Math.min(grossIncome * 0.5, 100_000);

  // PVD: up to 15% of income, max 500,000
  const pvdDeduction = Math.min(t.pvdContribution, grossIncome * 0.15, 500_000);

  // Tax-advantaged investment limit (RMF + SSF + PVD combined ≤ 500,000)
  const investmentBudget = Math.max(0, 500_000 - pvdDeduction);

  // RMF: 30% of income, max 500,000, but combined with SSF/PVD ≤ 500,000
  const rmfDeduction = Math.min(t.rmfContribution, grossIncome * 0.30, investmentBudget);
  const remainingBudget = Math.max(0, investmentBudget - rmfDeduction);

  // SSF: 30% of income, max 200,000
  const ssfDeduction = Math.min(t.ssfContribution, grossIncome * 0.30, 200_000, remainingBudget);

  // Life insurance: max 100,000
  const lifeInsuranceDeduction = Math.min(t.lifeInsurancePremium, 100_000);

  // Health insurance: max 25,000
  const healthInsuranceDeduction = Math.min(t.healthInsurancePremium, 25_000);

  // Mortgage interest: max 100,000
  const mortgageInterestDeduction = Math.min(t.mortgageInterestDeduction, 100_000);

  // Parental: 30,000 per parent
  const parentalDeduction = t.parentalDeduction;

  // Child deduction
  const childDeduction = t.childDeduction;

  // Personal allowance
  const personalAllowance = t.personalDeduction || 60_000;

  const totalDeductions =
    employmentDeduction +
    pvdDeduction +
    rmfDeduction +
    ssfDeduction +
    lifeInsuranceDeduction +
    healthInsuranceDeduction +
    mortgageInterestDeduction +
    parentalDeduction +
    childDeduction +
    t.otherDeductions +
    personalAllowance;

  const taxableIncome = Math.max(0, grossIncome - totalDeductions);
  const estimatedTax = calcThaiTax(taxableIncome);
  const effectiveTaxRate = grossIncome > 0 ? estimatedTax / grossIncome : 0;

  // Marginal rate
  let marginalRate = 0;
  let cum = 0;
  let prevLim = 0;
  for (const b of BRACKETS) {
    cum += b.limit - prevLim;
    if (cum >= taxableIncome) { marginalRate = b.rate; break; }
    prevLim = b.limit;
  }

  // Tax saved by RMF: tax without RMF minus tax with RMF
  const taxWithoutRMF = calcThaiTax(Math.max(0, taxableIncome + rmfDeduction));
  const taxSavedByRMF = taxWithoutRMF - estimatedTax;

  // Tax saved by PVD
  const taxWithoutPVD = calcThaiTax(Math.max(0, taxableIncome + pvdDeduction));
  const taxSavedByPVD = taxWithoutPVD - estimatedTax;

  // Additional RMF room
  const maxRMF = Math.min(grossIncome * 0.30, investmentBudget);
  const additionalRMFRoom = Math.max(0, maxRMF - rmfDeduction);
  const maxSSF = Math.min(grossIncome * 0.30, 200_000, remainingBudget);
  const additionalSSFRoom = Math.max(0, maxSSF - ssfDeduction);

  return {
    grossIncome,
    employmentDeduction,
    pvdDeduction,
    rmfDeduction,
    ssfDeduction,
    lifeInsuranceDeduction,
    healthInsuranceDeduction,
    mortgageInterestDeduction,
    parentalDeduction,
    childDeduction,
    otherDeductions: t.otherDeductions,
    personalAllowance,
    totalDeductions,
    taxableIncome,
    estimatedTax,
    effectiveTaxRate,
    marginalRate,
    taxSavedByRMF,
    taxSavedByPVD,
    additionalRMFRoom,
    additionalSSFRoom,
  };
}

// ============================================================
// INCOME-PAGE TAXABLE PORTION (Thailand scheme)
// ────────────────────────────────────────────────────────────
// Derives the *real* taxable portion of income straight from the
// income items, so the Income page can show what fraction of gross
// income is actually subject to tax — with SSO + PVD + the personal
// allowance deducted directly in that section to keep it simple.
//
// Statutory parameters effective from January 2026:
//   - SSO employee contribution: 5% of monthly wage, capped at the
//     new ฿17,500 wage ceiling → max ฿875/mo (฿10,500/yr).
//   - Employment income (Section 40(1)/(2)): 50% standard expense
//     deduction, COMBINED cap ฿100,000.
//   - Rental income (Section 40(5)): 30% standard expense deduction.
//   - PVD: deductible up to 15% of salary, within the ฿500,000
//     combined retirement cap (PVD + RMF + SSF).
//   - Personal allowance: ฿60,000.
// ============================================================

export const TH_PARAMS_2026 = {
  ssoEmployeeRate: 0.05,
  ssoMonthlyEmployeeMax: 875, // ฿17,500 ceiling × 5%, from Jan 2026
  pvdMaxRate: 0.15,
  retirementCombinedCap: 500_000,
  personalAllowance: 60_000,
  employmentDeductionRate: 0.5,
  employmentDeductionCap: 100_000,
  rentalExpenseRate: 0.30,
} as const;

/** Portion of annual base salary (ABS) that is NOT PVD-eligible.
 *  PVD is contributed on (ABS − this offset). */
export const PVD_BASE_OFFSET = 240_000;

const EMPLOYMENT_CATEGORIES = new Set(["salary", "bonus", "freelance"]);

/** Annualize an income item, matching the Income page's monthly totals
 *  (yearly as-is, monthly ×12, one-time excluded). */
function annualizeIncome(item: IncomeItem): number {
  const amount = effectiveIncomeAmount(item);
  if (item.frequency === "yearly") return amount;
  if (item.frequency === "monthly") return amount * 12;
  return 0; // one-time excluded
}

export interface IncomeTaxBreakdown {
  grossAnnualIncome: number;          // all active income, annualized
  taxableGrossIncome: number;         // active + taxable sources only
  employmentIncome: number;
  rentalIncome: number;
  otherTaxableIncome: number;
  // Section-40 standard expense deductions
  employmentExpenseDeduction: number;
  rentalExpenseDeduction: number;
  totalExpenseDeductions: number;
  // Direct statutory deductions (shown on the income section)
  ssoDeduction: number;
  pvdDeduction: number;
  personalAllowance: number;
  totalDirectDeductions: number;
  // Results
  netTaxableIncome: number;
  taxablePortionPct: number;          // netTaxableIncome ÷ grossAnnualIncome
  estimatedTax: number;
  effectiveRateOnGross: number;
  pvdRate: number;
}

/**
 * Compute the Thai-scheme taxable portion directly from income items.
 * @param incomes  income list (active + taxable items are used)
 * @param opts.pvdRate  employee PVD rate as a fraction of salary (e.g. 0.10)
 * @param opts.ssoAnnual  override annual SSO contribution (default: computed at the 2026 cap)
 * @param opts.personalAllowance  override personal allowance (default ฿60,000)
 */
export function computeIncomeTaxBreakdown(
  incomes: IncomeItem[],
  opts: { pvdRate?: number; ssoAnnual?: number; personalAllowance?: number; pvdBaseOffset?: number } = {}
): IncomeTaxBreakdown {
  const p = TH_PARAMS_2026;
  const active = incomes.filter(i => i.isActive);
  const grossAnnualIncome = active.reduce((s, i) => s + annualizeIncome(i), 0);

  let employmentIncome = 0;
  let salaryIncome = 0;
  let rentalIncome = 0;
  let otherTaxableIncome = 0;

  for (const i of active.filter(i => i.isTaxable)) {
    const a = annualizeIncome(i);
    if (i.category === "salary") salaryIncome += a;
    if (EMPLOYMENT_CATEGORIES.has(i.category)) employmentIncome += a;
    else if (i.category === "rental") rentalIncome += a;
    else otherTaxableIncome += a;
  }

  const taxableGrossIncome = employmentIncome + rentalIncome + otherTaxableIncome;

  const employmentExpenseDeduction = Math.min(
    employmentIncome * p.employmentDeductionRate,
    p.employmentDeductionCap
  );
  const rentalExpenseDeduction = rentalIncome * p.rentalExpenseRate;
  const totalExpenseDeductions = employmentExpenseDeduction + rentalExpenseDeduction;

  // SSO: 5% of monthly salary, capped at the 2026 ceiling.
  const monthlySalary = salaryIncome / 12;
  const ssoDeduction =
    opts.ssoAnnual ?? Math.min(monthlySalary * p.ssoEmployeeRate, p.ssoMonthlyEmployeeMax) * 12;

  // PVD: rate × (salary − non-eligible offset), within the ฿500,000 combined cap.
  const pvdRate = Math.min(Math.max(opts.pvdRate ?? 0, 0), p.pvdMaxRate);
  const pvdBase = Math.max(0, salaryIncome - (opts.pvdBaseOffset ?? 0));
  const pvdDeduction = Math.min(pvdBase * pvdRate, p.retirementCombinedCap);

  const personalAllowance = opts.personalAllowance ?? p.personalAllowance;
  const totalDirectDeductions = ssoDeduction + pvdDeduction + personalAllowance;

  const netTaxableIncome = Math.max(
    0,
    taxableGrossIncome - totalExpenseDeductions - totalDirectDeductions
  );
  const estimatedTax = calcThaiTax(netTaxableIncome);
  const taxablePortionPct = grossAnnualIncome > 0 ? netTaxableIncome / grossAnnualIncome : 0;
  const effectiveRateOnGross = grossAnnualIncome > 0 ? estimatedTax / grossAnnualIncome : 0;

  return {
    grossAnnualIncome,
    taxableGrossIncome,
    employmentIncome,
    rentalIncome,
    otherTaxableIncome,
    employmentExpenseDeduction,
    rentalExpenseDeduction,
    totalExpenseDeductions,
    ssoDeduction,
    pvdDeduction,
    personalAllowance,
    totalDirectDeductions,
    netTaxableIncome,
    taxablePortionPct,
    estimatedTax,
    effectiveRateOnGross,
    pvdRate,
  };
}

/** Compare "invest more for tax relief" vs "pay down debt" */
export function compareTaxVsDebt(params: {
  tax: TaxAssumptions;
  extraAmount: number;
  debtInterestRate: number;
}): {
  taxReliefBenefit: number;
  debtInterestSaving: number;
  recommendation: "tax-relief" | "debt-paydown" | "equal";
  reasoning: string;
} {
  const baseResult = computeTax(params.tax);
  const withExtraRMF = computeTax({
    ...params.tax,
    rmfContribution: params.tax.rmfContribution + params.extraAmount,
  });
  const taxReliefBenefit = baseResult.estimatedTax - withExtraRMF.estimatedTax;
  const debtInterestSaving = params.extraAmount * params.debtInterestRate;

  const recommendation =
    taxReliefBenefit > debtInterestSaving
      ? "tax-relief"
      : taxReliefBenefit < debtInterestSaving
      ? "debt-paydown"
      : "equal";

  return {
    taxReliefBenefit,
    debtInterestSaving,
    recommendation,
    reasoning:
      recommendation === "tax-relief"
        ? `Investing ฿${params.extraAmount.toLocaleString()} in RMF saves ฿${taxReliefBenefit.toFixed(0)} in tax vs ฿${debtInterestSaving.toFixed(0)} in debt interest. Invest for tax relief.`
        : recommendation === "debt-paydown"
        ? `Paying ฿${params.extraAmount.toLocaleString()} toward debt saves ฿${debtInterestSaving.toFixed(0)} in interest vs ฿${taxReliefBenefit.toFixed(0)} in tax. Pay down debt.`
        : "Both strategies yield equal benefit.",
  };
}
