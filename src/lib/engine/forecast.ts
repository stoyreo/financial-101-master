/**
 * FORECAST ENGINE
 * ───────────────
 * Generates year-by-year and month-by-month financial projections.
 *
 * Logic:
 *  1. For each year from planningStart → lifeExpectancy:
 *     a. Compute income (with growth, taxability)
 *     b. Compute expenses (with inflation)
 *     c. Compute debt payments + update balances
 *     d. Update investment balances (contributions + returns)
 *     e. Compute net worth = investments - debts + cash
 *     f. Flag milestones (mortgage paid off, debt free, retirement)
 *  2. Scenario overrides are applied as deltas on top of base values.
 */

import type {
  Profile, IncomeItem, ExpenseItem, DebtAccount,
  InvestmentAccount, RetirementAssumptions, Scenario,
  YearlyForecastRow, MonthlyForecastRow,
} from "../types";
import { calcAge, toYearly, toMonthly, applyGrowth, safeDivide } from "../utils";
import { buildAmortizationSchedule } from "./mortgage";
import { computeIncomeTaxBreakdown, PVD_BASE_OFFSET } from "./tax";
import { parseISO, format, addMonths } from "date-fns";

/** Employee provident-fund rate (% of salary) used for take-home cash flow.
 *  Matches the Income page default; PVD is withheld from pay into the fund,
 *  so it does not arrive in the bank account. */
const PVD_RATE = 0.10;

/** Build a growth-adjusted copy of the income list for a given year, so the
 *  Thai tax engine can estimate statutory outflow (PIT + SSO + PVD) on the
 *  income actually earned that year. Mirrors computeAnnualIncome's growth/shock. */
function scaleIncomesForYear(incomes: IncomeItem[], year: number, sa: Scenario["assumptions"]): IncomeItem[] {
  return incomes.map(inc => {
    if (!isItemActiveInYear(inc, year)) return { ...inc, isActive: false };
    const startY = parseInt(inc.startDate.split("-")[0], 10) || year;
    const yearsElapsed = Math.max(0, year - startY);
    const growthRate = sa.incomeGrowthRate ?? inc.annualGrowthRate;
    let amount = applyGrowth(inc.amount, growthRate, yearsElapsed);
    if (sa.incomeShockYear && year >= sa.incomeShockYear &&
        year < (sa.incomeShockYear + Math.ceil((sa.incomeShockDuration ?? 12) / 12))) {
      amount *= (sa.incomeShockFactor ?? 1);
    }
    return { ...inc, amount };
  });
}

/** Annual statutory outflow that never reaches the bank: income tax + SSO + PVD. */
function statutoryOutflowForYear(incomes: IncomeItem[], year: number, sa: Scenario["assumptions"]): number {
  const scaled = scaleIncomesForYear(incomes, year, sa);
  const b = computeIncomeTaxBreakdown(scaled, { pvdRate: PVD_RATE, pvdBaseOffset: PVD_BASE_OFFSET });
  return b.estimatedTax + b.ssoDeduction + b.pvdDeduction;
}

interface ForecastInput {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
  retirement: RetirementAssumptions;
  scenario: Scenario;
}

/** Check if an item is active in a given year */
function isItemActiveInYear(item: { startDate: string; endDate?: string; isActive: boolean }, year: number): boolean {
  if (!item.isActive) return false;
  const startY = parseInt(item.startDate.split("-")[0], 10) || 0;
  const endY = item.endDate ? parseInt(item.endDate.split("-")[0], 10) : 9999;
  return year >= startY && year <= endY;
}

/** Compute annual income for a given year with growth applied from start */
function computeAnnualIncome(incomes: IncomeItem[], year: number, sa: Scenario["assumptions"]): number {
  let total = 0;
  for (const inc of incomes) {
    if (!isItemActiveInYear(inc, year)) continue;
    const startY = parseInt(inc.startDate.split("-")[0], 10) || year;
    const yearsElapsed = Math.max(0, year - startY);
    const growthRate = sa.incomeGrowthRate ?? inc.annualGrowthRate;
    let annual = toYearly(applyGrowth(inc.amount, growthRate, yearsElapsed), inc.frequency);

    // Income shock
    if (sa.incomeShockYear && year >= sa.incomeShockYear &&
        year < (sa.incomeShockYear + Math.ceil((sa.incomeShockDuration ?? 12) / 12))) {
      annual *= (sa.incomeShockFactor ?? 1);
    }
    total += annual;
  }
  // Add bonus override
  if (sa.annualBonusAmount && sa.annualBonusAmount > 0) {
    total += sa.annualBonusAmount;
  }
  return total;
}

/** Compute annual expenses for a given year with inflation */
function computeAnnualExpenses(expenses: ExpenseItem[], year: number, sa: Scenario["assumptions"]): number {
  let total = 0;
  for (const exp of expenses) {
    if (!isItemActiveInYear(exp, year)) continue;
    const startY = parseInt(exp.startDate.split("-")[0], 10) || year;
    const yearsElapsed = Math.max(0, year - startY);
    const inflation = sa.inflationRate ?? exp.inflationRate;
    total += toYearly(applyGrowth(exp.amount, inflation, yearsElapsed), exp.frequency);
  }
  // One-time expenses from scenario
  for (const ote of sa.oneTimeExpenses ?? []) {
    if (ote.year === year) total += ote.amount;
  }
  return total;
}

/** Pre-build all debt amortization schedules for fast lookup */
function buildDebtSchedules(debts: DebtAccount[], sa: Scenario["assumptions"]) {
  const schedules: Record<string, ReturnType<typeof buildAmortizationSchedule>> = {};
  for (const debt of debts) {
    if (!debt.isActive) continue;
    if (debt.debtType === "mortgage") {
      const extraPayment = sa.mortgageExtraMonthlyPayment ?? debt.extraMonthlyPayment;
      const lumpSum = sa.annualLumpSumPrepayment ?? (debt.annualPrepayment ?? 0);
      schedules[debt.id] = buildAmortizationSchedule({
        openingBalance: debt.currentBalance,
        annualRate: sa.mortgageRateChange ? debt.annualInterestRate : debt.annualInterestRate,
        termMonths: debt.loanTermMonths ?? 360,
        standardMonthlyPayment: debt.standardMonthlyPayment,
        extraMonthlyPayment: extraPayment,
        annualLumpSum: lumpSum,
        startDate: debt.startDate,
        refinanceDate: sa.refinanceYear
          ? `${sa.refinanceYear}-01-01`
          : debt.refinanceDate,
        refinanceNewRate: sa.refinanceRate ?? debt.refinanceNewRate,
        refinanceFee: debt.refinanceFee,
        rateChangeDate: sa.mortgageRateChangeYear ? `${sa.mortgageRateChangeYear}-01-01` : undefined,
        newRateAfterChange: sa.mortgageRateChange
          ? debt.annualInterestRate + sa.mortgageRateChange
          : undefined,
      });
    } else {
      // Simple debt: constant payment
      schedules[debt.id] = buildAmortizationSchedule({
        openingBalance: debt.currentBalance,
        annualRate: debt.annualInterestRate,
        termMonths: 360,
        standardMonthlyPayment: debt.standardMonthlyPayment,
        extraMonthlyPayment: debt.extraMonthlyPayment,
        annualLumpSum: 0,
        startDate: debt.startDate,
      });
    }
  }
  return schedules;
}

/** Get mortgage balance at end of a given year from schedule */
function getDebtBalanceAtYear(
  schedule: ReturnType<typeof buildAmortizationSchedule>,
  year: number,
  startDate: string
): number {
  // Find last row for this calendar year
  const rows = schedule.filter(r => r.calendarYear <= year);
  if (rows.length === 0) return 0;
  return rows[rows.length - 1].closingBalance;
}

/** Get annual debt payments in a given year */
function getAnnualDebtPayments(
  schedule: ReturnType<typeof buildAmortizationSchedule>,
  year: number
): number {
  return schedule
    .filter(r => r.calendarYear === year)
    .reduce((sum, r) => sum + r.totalPayment, 0);
}

/** Generate yearly forecast rows */
export function generateYearlyForecast(input: ForecastInput): YearlyForecastRow[] {
  const { profile, incomes, expenses, debts, investments, retirement, scenario } = input;
  const sa = scenario.assumptions;

  const dob = profile.dateOfBirth;
  const birthYear = parseInt(dob.split("-")[0], 10);
  const currentYear = new Date().getFullYear();
  const startYear = parseInt(profile.planningStartDate.split("-")[0], 10) || currentYear;
  const endYear = birthYear + profile.lifeExpectancy;
  const retirementYear = birthYear + (sa.retirementAge ?? profile.retirementAge);

  const debtSchedules = buildDebtSchedules(debts, sa);

  let investmentBalance = investments.filter(i => i.isActive).reduce((s, i) => s + i.marketValue, 0);
  let cashBalance = profile.currentCashBalance;
  const rows: YearlyForecastRow[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const age = year - birthYear;
    const isRetired = year >= retirementYear;

    // ── Income (net take-home — cash actually reaching the bank) ──
    // Gross employment income minus statutory outflow (Thai PIT + SSO + PVD).
    let totalIncome = 0;
    if (isRetired) {
      // Pension/SSO benefits in retirement (already net of payroll deductions).
      totalIncome = (retirement.pensionMonthlyAmount + retirement.ssoMonthlyBenefit) * 12;
    } else {
      const grossIncome = computeAnnualIncome(incomes, year, sa);
      const statutoryOutflow = statutoryOutflowForYear(incomes, year, sa);
      totalIncome = Math.max(0, grossIncome - statutoryOutflow);
    }

    // ── Expenses ─────────────────────────────────────────
    const totalExpenses = computeAnnualExpenses(expenses, year, sa);

    // ── Debt payments ────────────────────────────────────
    let totalDebtPayments = 0;
    let mortgageBalance = 0;
    let totalDebtBalance = 0;
    let isMortgagePaidOff = true;

    for (const debt of debts) {
      if (!debt.isActive) continue;
      const schedule = debtSchedules[debt.id];
      if (!schedule) continue;

      const balance = getDebtBalanceAtYear(schedule, year, debt.startDate);
      totalDebtBalance += balance;
      if (debt.debtType === "mortgage") {
        mortgageBalance = balance;
        if (balance > 0) isMortgagePaidOff = false;
      }
      totalDebtPayments += getAnnualDebtPayments(schedule, year);
    }

    // ── Investments ──────────────────────────────────────
    const returnRate = sa.investmentReturnRate ?? 0.07;
    const annualContrib = isRetired
      ? 0
      : investments
          .filter(i => i.isActive)
          .reduce((s, i) => s + i.annualContribution + i.monthlyContribution * 12, 0);

    investmentBalance = investmentBalance * (1 + returnRate) + annualContrib;

    // Retirement withdrawal
    let retirementWithdrawal = 0;
    if (isRetired) {
      const inflRate = sa.inflationRate ?? retirement.inflationRate;
      const yearsInRetirement = year - retirementYear;
      retirementWithdrawal = applyGrowth(retirement.expectedAnnualExpense, inflRate, yearsInRetirement);
      investmentBalance = Math.max(0, investmentBalance - retirementWithdrawal);
    }

    // ── Net cash flow ────────────────────────────────────
    const netCashFlow = totalIncome - totalExpenses - totalDebtPayments;

    // Update cash
    cashBalance = Math.max(profile.targetMinCashBalance, cashBalance + netCashFlow * 0.3);

    // ── Net worth ─────────────────────────────────────────
    const netWorth = investmentBalance + cashBalance - totalDebtBalance;

    // ── Ratios ───────────────────────────────────────────
    const debtToIncomeRatio = safeDivide(totalDebtBalance, totalIncome);
    const debtServiceRatio = safeDivide(totalDebtPayments, totalIncome);

    // ── Milestones ───────────────────────────────────────
    const milestones: string[] = [];
    if (isMortgagePaidOff && rows.length > 0 && !rows[rows.length - 1].isMortgagePaidOff) {
      milestones.push("Mortgage Paid Off");
    }
    if (isRetired && (rows.length === 0 || !rows[rows.length - 1].isRetired)) {
      milestones.push("Retirement Begins");
    }
    if (totalDebtBalance <= 0 && rows.length > 0 && rows[rows.length - 1].totalDebtBalance > 0) {
      milestones.push("Debt Free");
    }
    const emergencyFundTarget = profile.emergencyFundTargetMonths * (totalExpenses / 12);
    if (cashBalance >= emergencyFundTarget && rows.length > 0 && rows[rows.length - 1].milestones.indexOf("Emergency Fund Achieved") < 0) {
      milestones.push("Emergency Fund Achieved");
    }

    rows.push({
      year,
      age,
      totalIncome,
      totalExpenses,
      totalDebtPayments,
      netCashFlow,
      mortgageBalance,
      totalDebtBalance,
      investmentBalance,
      netWorth,
      debtToIncomeRatio,
      debtServiceRatio,
      isMortgagePaidOff,
      isRetired,
      retirementWithdrawal,
      milestones,
    });
  }

  return rows;
}

/** Generate monthly forecast for the near-term (5 years) */
export function generateMonthlyForecast(input: ForecastInput): MonthlyForecastRow[] {
  const { profile, incomes, expenses, debts, investments, scenario } = input;
  const sa = scenario.assumptions;
  const today = new Date();
  const rows: MonthlyForecastRow[] = [];
  const debtSchedules = buildDebtSchedules(debts, sa);

  let investmentBalance = investments.filter(i => i.isActive).reduce((s, i) => s + i.marketValue, 0);

  // Cache annual statutory outflow (PIT + SSO + PVD) per calendar year so the
  // take-home figure is consistent month to month and we don't recompute 60×.
  const monthlyOutflowByYear: Record<number, number> = {};

  for (let m = 0; m < 60; m++) {
    const dt = addMonths(today, m);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const yearFraction = year - parseInt(profile.planningStartDate.split("-")[0], 10);

    // Monthly gross income
    let grossMonthly = 0;
    for (const inc of incomes) {
      if (!inc.isActive) continue;
      const growth = sa.incomeGrowthRate ?? inc.annualGrowthRate;
      grossMonthly += toMonthly(applyGrowth(inc.amount, growth, yearFraction), inc.frequency);
    }

    // Statutory outflow → net take-home (cash into the bank)
    if (monthlyOutflowByYear[year] === undefined) {
      const scaled = incomes.map(inc => ({
        ...inc,
        amount: applyGrowth(inc.amount, sa.incomeGrowthRate ?? inc.annualGrowthRate, yearFraction),
      }));
      const b = computeIncomeTaxBreakdown(scaled, { pvdRate: PVD_RATE, pvdBaseOffset: PVD_BASE_OFFSET });
      monthlyOutflowByYear[year] = (b.estimatedTax + b.ssoDeduction + b.pvdDeduction) / 12;
    }
    const totalIncome = Math.max(0, grossMonthly - monthlyOutflowByYear[year]);

    // Monthly expenses
    let totalExpenses = 0;
    for (const exp of expenses) {
      if (!exp.isActive) continue;
      const infl = sa.inflationRate ?? exp.inflationRate;
      totalExpenses += toMonthly(applyGrowth(exp.amount, infl, yearFraction), exp.frequency);
    }

    // Monthly debt payments + balances
    let mortgagePayment = 0;
    let otherDebtPayments = 0;
    let mortgageBalance = 0;
    let totalDebtBalance = 0;

    for (const debt of debts) {
      if (!debt.isActive) continue;
      const schedule = debtSchedules[debt.id];
      if (!schedule) continue;
      // Find row for this calendar month
      const row = schedule.find(r => r.calendarYear === year && r.calendarMonth === month);
      if (row) {
        if (debt.debtType === "mortgage") {
          mortgagePayment += row.totalPayment;
          mortgageBalance = row.closingBalance;
        } else {
          otherDebtPayments += row.totalPayment;
        }
      }
      // Balance at end of month
      const lastRowForMonth = schedule.filter(r =>
        r.calendarYear < year || (r.calendarYear === year && r.calendarMonth <= month)
      );
      if (lastRowForMonth.length > 0) {
        totalDebtBalance += lastRowForMonth[lastRowForMonth.length - 1].closingBalance;
      }
    }

    const totalDebtPayments = mortgagePayment + otherDebtPayments;
    const netCashFlow = totalIncome - totalExpenses - totalDebtPayments;

    // Investment growth (monthly)
    const monthlyReturn = Math.pow(1 + (sa.investmentReturnRate ?? 0.07), 1 / 12) - 1;
    const monthlyContrib = investments.filter(i => i.isActive).reduce((s, i) => s + i.monthlyContribution, 0);
    investmentBalance = investmentBalance * (1 + monthlyReturn) + monthlyContrib;

    const netWorth = investmentBalance - totalDebtBalance + profile.currentCashBalance;

    rows.push({
      year,
      month,
      label: format(dt, "MMM yyyy"),
      totalIncome,
      totalExpenses,
      mortgagePayment,
      otherDebtPayments,
      totalDebtPayments,
      netCashFlow,
      mortgageBalance,
      totalDebtBalance,
      investmentBalance,
      netWorth,
      isNegativeCashFlow: netCashFlow < 0,
    });
  }

  return rows;
}
