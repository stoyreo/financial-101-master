/**
 * MORTGAGE ENGINE
 * ────────────────
 * Computes month-by-month amortization schedules with support for:
 *   - Standard P&I payments
 *   - Extra monthly principal payments
 *   - Annual lump-sum prepayments
 *   - Refinancing mid-term (changes rate + fees)
 *   - Rate change scenarios
 *
 * All formulas are deterministic and fully transparent.
 */

import type { AmortizationRow, MortgageSummary, PlannedPayment } from "../types";
import { calcMonthlyPayment, fmtMonthYear } from "../utils";
import { parseISO, addMonths, format } from "date-fns";

export interface MortgageParams {
  openingBalance: number;
  annualRate: number;           // decimal, e.g. 0.065
  termMonths: number;
  standardMonthlyPayment?: number; // if 0, computed from formula
  extraMonthlyPayment: number;
  annualLumpSum: number;        // extra payment made once a year (e.g. bonus payment)
  startDate: string;            // ISO yyyy-MM-dd
  // Optional refinance
  refinanceDate?: string;
  refinanceNewRate?: number;
  refinanceFee?: number;
  // Optional rate change (scenario)
  rateChangeDate?: string;
  newRateAfterChange?: number;
  /** Planned total-monthly-payment step-ups, each covering a [startYear,
   *  endYear] calendar-year range (endYear undefined = open-ended, i.e. keep
   *  paying this amount until the loan is paid off or a later/more-specific
   *  entry takes over). That entry's monthlyPayment replaces standard+extra
   *  for any month whose calendar year falls in its range. */
  plannedPayments?: PlannedPayment[];
}

/** Find the planned-payment amount that applies for a given calendar year:
 *  among all entries whose [startYear, endYear] range contains calYear, the
 *  one with the latest startYear wins (most specific/most recent override).
 *  Returns undefined if no entry's range covers this year. */
function activePlannedPayment(plannedPayments: PlannedPayment[] | undefined, calYear: number): number | undefined {
  if (!plannedPayments || plannedPayments.length === 0) return undefined;
  let best: PlannedPayment | undefined;
  for (const p of plannedPayments) {
    const inRange = calYear >= p.startYear && (p.endYear === undefined || calYear <= p.endYear);
    if (inRange && (!best || p.startYear > best.startYear)) best = p;
  }
  return best?.monthlyPayment;
}

export function buildAmortizationSchedule(params: MortgageParams): AmortizationRow[] {
  const {
    openingBalance,
    annualRate,
    termMonths,
    extraMonthlyPayment,
    annualLumpSum,
    startDate,
    refinanceDate,
    refinanceNewRate,
    refinanceFee = 0,
    rateChangeDate,
    newRateAfterChange,
    plannedPayments,
  } = params;

  if (openingBalance <= 0) return [];

  const startDt = parseISO(startDate);
  // Compute standard payment if not provided
  const basePayment =
    params.standardMonthlyPayment && params.standardMonthlyPayment > 0
      ? params.standardMonthlyPayment
      : calcMonthlyPayment(openingBalance, annualRate, termMonths);

  let balance = openingBalance;
  let monthlyRate = annualRate / 12;
  let payment = basePayment;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const rows: AmortizationRow[] = [];

  const refinanceDt = refinanceDate ? parseISO(refinanceDate) : null;
  const rateChangeDt = rateChangeDate ? parseISO(rateChangeDate) : null;
  let refinanceDone = false;
  let rateChangeDone = false;

  for (let month = 1; month <= termMonths * 2; month++) {
    if (balance <= 0.01) break;

    const currentDt = addMonths(startDt, month - 1);
    const calYear = currentDt.getFullYear();
    const calMonth = currentDt.getMonth() + 1;

    // --- Refinance event ---
    if (refinanceDt && !refinanceDone && currentDt >= refinanceDt) {
      balance += refinanceFee; // fee capitalised (worst case)
      monthlyRate = (refinanceNewRate ?? annualRate) / 12;
      // Recalculate remaining payment for new rate over remaining term
      const remainingMonths = termMonths - month + 1;
      payment = calcMonthlyPayment(balance, monthlyRate * 12, Math.max(remainingMonths, 1));
      refinanceDone = true;
    }

    // --- Rate change scenario ---
    if (rateChangeDt && !rateChangeDone && currentDt >= rateChangeDt) {
      monthlyRate = (newRateAfterChange ?? annualRate) / 12;
      const remainingMonths = termMonths - month + 1;
      payment = calcMonthlyPayment(balance, monthlyRate * 12, Math.max(remainingMonths, 1));
      rateChangeDone = true;
    }

    // --- Planned payment override (Y1/Y2/Y3... step-up plan) ---
    // If the borrower has set a planned total monthly payment for this
    // calendar year (or an earlier year that still applies), it replaces
    // the standard + extra payment outright for this month.
    const plannedOverride = activePlannedPayment(plannedPayments, calYear);
    const effectivePayment = plannedOverride ?? payment;
    const effectiveExtraMonthly = plannedOverride !== undefined ? 0 : extraMonthlyPayment;

    const interestPaid = balance * monthlyRate;
    // Scheduled principal = payment - interest, but can't exceed balance
    const scheduledPrincipal = Math.max(0, Math.min(effectivePayment - interestPaid, balance));
    const actualPayment = Math.min(effectivePayment, balance + interestPaid);

    // Annual lump sum: applied in month 12, 24, 36... of loan
    const isAnnualPaymentMonth = annualLumpSum > 0 && month % 12 === 0;
    const extra = Math.min(
      effectiveExtraMonthly + (isAnnualPaymentMonth ? annualLumpSum : 0),
      Math.max(0, balance - scheduledPrincipal)
    );

    const principalPaid = scheduledPrincipal + extra;
    const closingBalance = Math.max(0, balance - principalPaid);

    cumulativeInterest += interestPaid;
    cumulativePrincipal += principalPaid;

    rows.push({
      month,
      calendarYear: calYear,
      calendarMonth: calMonth,
      openingBalance: balance,
      scheduledPayment: actualPayment,
      extraPrincipal: extra,
      totalPayment: actualPayment + extra,
      interestPaid,
      principalPaid,
      closingBalance,
      cumulativeInterest,
      cumulativePrincipal,
    });

    balance = closingBalance;
    if (balance <= 0.01) break;
  }

  return rows;
}

/** Build baseline schedule WITHOUT extra payments (for comparison) */
export function buildBaselineSchedule(params: MortgageParams): AmortizationRow[] {
  return buildAmortizationSchedule({
    ...params,
    extraMonthlyPayment: 0,
    annualLumpSum: 0,
    plannedPayments: undefined,
  });
}

/** Summarise a mortgage schedule into key metrics */
export function summariseMortgage(params: MortgageParams): MortgageSummary {
  const schedule = buildAmortizationSchedule(params);
  const baseline = buildBaselineSchedule(params);

  const lastRow = schedule[schedule.length - 1];
  const lastBaseRow = baseline[baseline.length - 1];

  const payoffMonth = schedule.length;
  const payoffDt = addMonths(parseISO(params.startDate), payoffMonth - 1);

  const basePayment =
    params.standardMonthlyPayment && params.standardMonthlyPayment > 0
      ? params.standardMonthlyPayment
      : calcMonthlyPayment(params.openingBalance, params.annualRate, params.termMonths);

  return {
    originalBalance: params.openingBalance,
    monthlyPayment: basePayment,
    payoffMonth,
    payoffDate: format(payoffDt, "MMMM yyyy"),
    totalInterestPaid: lastRow?.cumulativeInterest ?? 0,
    totalPaid: (lastRow?.cumulativePrincipal ?? 0) + (lastRow?.cumulativeInterest ?? 0),
    monthsSaved: Math.max(0, baseline.length - schedule.length),
    interestSaved: Math.max(0, (lastBaseRow?.cumulativeInterest ?? 0) - (lastRow?.cumulativeInterest ?? 0)),
    schedule,
  };
}

/** Compare multiple extra-payment scenarios side by side */
export function compareExtraPaymentScenarios(
  baseParams: MortgageParams,
  extraAmounts: number[]
): Array<{
  extraMonthly: number;
  payoffMonths: number;
  payoffDate: string;
  totalInterest: number;
  interestSaved: number;
  monthsSaved: number;
}> {
  const baseline = summariseMortgage({ ...baseParams, extraMonthlyPayment: 0 });
  return extraAmounts.map((extra) => {
    const s = summariseMortgage({ ...baseParams, extraMonthlyPayment: extra });
    return {
      extraMonthly: extra,
      payoffMonths: s.payoffMonth,
      payoffDate: s.payoffDate,
      totalInterest: s.totalInterestPaid,
      interestSaved: baseline.totalInterestPaid - s.totalInterestPaid,
      monthsSaved: baseline.payoffMonth - s.payoffMonth,
    };
  });
}
