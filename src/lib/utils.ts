import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, differenceInYears, addMonths, addYears } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number as THB currency */
export function thb(value: number, decimals = 0): string {
  if (!isFinite(value)) return "฿0";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format number with commas */
export function num(value: number, decimals = 0): string {
  if (!isFinite(value)) return "0";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format percentage */
export function pct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Calculate current age from DOB string */
export function calcAge(dob: string, referenceDate?: Date): number {
  if (!dob) return 0;
  try {
    return differenceInYears(referenceDate ?? new Date(), parseISO(dob));
  } catch {
    return 0;
  }
}

/** Get the year a person will reach a given age */
export function yearAtAge(dob: string, targetAge: number): number {
  const birthYear = parseInt(dob.split("-")[0], 10);
  return birthYear + targetAge;
}

/** Probability-weighted expected value of an income item. For most income
 *  `probability` is undefined (treated as 100%). For STI/bonus items entered
 *  as a maximum payout with a % chance of hitting it, this returns the
 *  expected value used everywhere income is totaled or forecast. */
export function effectiveIncomeAmount(item: { amount: number; probability?: number }): number {
  const p = item.probability;
  if (p === undefined || p === null) return item.amount;
  return item.amount * (Math.max(0, Math.min(100, p)) / 100);
}

/** Convert frequency amount to monthly */
export function toMonthly(amount: number, frequency: string): number {
  if (frequency === "monthly") return amount;
  if (frequency === "yearly") return amount / 12;
  if (frequency === "one-time") return 0; // handled separately
  return amount;
}

/** Convert frequency amount to yearly */
export function toYearly(amount: number, frequency: string): number {
  if (frequency === "monthly") return amount * 12;
  if (frequency === "yearly") return amount;
  if (frequency === "one-time") return amount;
  return amount;
}

/** Apply compound growth for N years */
export function applyGrowth(baseAmount: number, rate: number, years: number): number {
  return baseAmount * Math.pow(1 + rate, years);
}

/** Standard annuity payment formula */
export function calcMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

/** Format date as readable string */
export function fmtDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d MMM yyyy");
  } catch {
    return dateStr;
  }
}

/** Format month/year */
export function fmtMonthYear(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), "MMM yyyy");
}

/** Safe division (returns 0 on divide-by-zero) */
export function safeDivide(a: number, b: number): number {
  if (b === 0 || !isFinite(b)) return 0;
  return a / b;
}

/** Color by value (positive = green, negative = red) */
export function cashFlowColor(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export { addMonths, addYears, parseISO, format };
