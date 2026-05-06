/**
 * FORECAST INSIGHTS
 * ─────────────────
 * Pure functions that derive a ranked list of LIVE financial insights
 * directly from a yearly forecast + monthly forecast + supporting state.
 *
 * Used by the LiveAISignal banner on /forecast — refreshes every render
 * without any network call, so the "live" feel comes from the data itself
 * changing as the user edits inputs / switches scenarios.
 */

import type {
  YearlyForecastRow, MonthlyForecastRow, Profile, Scenario,
} from "./types";

export type InsightSeverity = "critical" | "warning" | "positive" | "info";

export interface LiveInsight {
  id: string;
  severity: InsightSeverity;
  headline: string;          // 1 short sentence
  detail: string;            // 1–2 supporting sentences w/ numbers
  metric?: { label: string; value: string };
  cta?: { label: string; href: string };
  /** Higher = more urgent. Used to pick the top insight when one is shown. */
  priority: number;
}

interface DeriveInput {
  yearly: YearlyForecastRow[];
  monthly: MonthlyForecastRow[];
  profile: Profile;
  scenario: Scenario;
}

const fmtTHB = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`;
  return `฿${n.toFixed(0)}`;
};

export function deriveLiveInsights(input: DeriveInput): LiveInsight[] {
  const { yearly, monthly, profile, scenario } = input;
  const insights: LiveInsight[] = [];

  if (yearly.length === 0) return insights;

  const first = yearly[0];
  const last = yearly[yearly.length - 1];
  const retirementYear = yearly.find(y => y.isRetired);
  const mortgagePayoff = yearly.find(y => y.isMortgagePaidOff && (yearly[0]?.mortgageBalance ?? 0) > 0);
  const debtFreeYear = yearly.find(y => y.totalDebtBalance <= 0 && yearly[0].totalDebtBalance > 0);

  // ── 1. Negative cash flow alert (5y) ───────────────────────
  const negMonths = monthly.filter(m => m.isNegativeCashFlow);
  if (negMonths.length > 0) {
    const worst = negMonths.reduce((w, m) => (m.netCashFlow < w.netCashFlow ? m : w), negMonths[0]);
    insights.push({
      id: "neg-cashflow",
      severity: negMonths.length > 6 ? "critical" : "warning",
      headline: `${negMonths.length} month${negMonths.length > 1 ? "s" : ""} of negative cash flow ahead`,
      detail: `Worst single month is ${worst.label} at ${fmtTHB(worst.netCashFlow)}. Tighten discretionary spend or front-load income before then.`,
      metric: { label: "Worst month", value: fmtTHB(worst.netCashFlow) },
      cta: { label: "Tune scenario", href: "/scenarios" },
      priority: negMonths.length > 6 ? 95 : 75,
    });
  }

  // ── 2. Debt-service ratio breach ───────────────────────────
  const dsrBreach = yearly.find(y => y.debtServiceRatio > 0.35);
  if (dsrBreach) {
    insights.push({
      id: "dsr-breach",
      severity: dsrBreach.debtServiceRatio > 0.5 ? "critical" : "warning",
      headline: `Debt service hits ${(dsrBreach.debtServiceRatio * 100).toFixed(1)}% of income in ${dsrBreach.year}`,
      detail: `Above the 35% prudential ceiling. Refinance, prepay, or front-load extra principal to stay below the line.`,
      metric: { label: `DSR ${dsrBreach.year}`, value: `${(dsrBreach.debtServiceRatio * 100).toFixed(1)}%` },
      cta: { label: "Open mortgage simulator", href: "/debts" },
      priority: dsrBreach.debtServiceRatio > 0.5 ? 90 : 65,
    });
  }

  // ── 3. Mortgage payoff acceleration ────────────────────────
  if (mortgagePayoff) {
    const yearsOut = mortgagePayoff.year - first.year;
    insights.push({
      id: "mortgage-payoff",
      severity: yearsOut <= 10 ? "positive" : "info",
      headline: `Mortgage retired in ${mortgagePayoff.year} (age ${mortgagePayoff.age})`,
      detail: `On the current trajectory you're debt-free on housing in ${yearsOut} years. Each ฿1k extra/month typically clips 6–12 months off this date.`,
      metric: { label: "Payoff year", value: String(mortgagePayoff.year) },
      cta: { label: "Stress-test extra payments", href: "/scenarios" },
      priority: 50,
    });
  }

  // ── 4. Retirement net-worth gap ────────────────────────────
  if (retirementYear) {
    const target25x = (retirementYear.totalExpenses) * 25; // 4% rule rough target
    const ratio = retirementYear.netWorth / Math.max(1, target25x);
    if (ratio < 0.6) {
      insights.push({
        id: "ret-gap",
        severity: "critical",
        headline: `Retirement nest egg only ${(ratio * 100).toFixed(0)}% of 25× expenses`,
        detail: `At age ${retirementYear.age} (${retirementYear.year}) you're projected at ${fmtTHB(retirementYear.netWorth)} vs a 4%-rule target of ${fmtTHB(target25x)}.`,
        metric: { label: "Coverage", value: `${(ratio * 100).toFixed(0)}%` },
        cta: { label: "Raise contributions", href: "/investments" },
        priority: 92,
      });
    } else if (ratio >= 1) {
      insights.push({
        id: "ret-on-track",
        severity: "positive",
        headline: `Retirement is on track — ${(ratio * 100).toFixed(0)}% of 25× target`,
        detail: `Projected ${fmtTHB(retirementYear.netWorth)} at age ${retirementYear.age}. You can afford a glide-path to lower-risk assets in the final decade.`,
        metric: { label: "Coverage", value: `${(ratio * 100).toFixed(0)}%` },
        cta: { label: "Review allocation", href: "/investments" },
        priority: 40,
      });
    } else {
      insights.push({
        id: "ret-near-track",
        severity: "warning",
        headline: `Retirement coverage at ${(ratio * 100).toFixed(0)}% — within reach`,
        detail: `A modest 10–15% lift in annual contributions or a 1–2 year delay closes the gap to 25× expenses.`,
        metric: { label: "Coverage", value: `${(ratio * 100).toFixed(0)}%` },
        cta: { label: "Try delay scenario", href: "/scenarios" },
        priority: 60,
      });
    }
  }

  // ── 5. Savings rate ────────────────────────────────────────
  if (first.totalIncome > 0) {
    const savingsRate = (first.totalIncome - first.totalExpenses - first.totalDebtPayments) / first.totalIncome;
    if (savingsRate < 0) {
      insights.push({
        id: "negative-savings",
        severity: "critical",
        headline: `Year-1 savings rate is ${(savingsRate * 100).toFixed(1)}%`,
        detail: `Spending exceeds inflows. Trim discretionary spend or boost income before compounding can do its work.`,
        priority: 98,
      });
    } else if (savingsRate < 0.1) {
      insights.push({
        id: "low-savings",
        severity: "warning",
        headline: `Savings rate just ${(savingsRate * 100).toFixed(1)}% — below 10% benchmark`,
        detail: `Closing this gap by even 5pp redirects ~${fmtTHB(first.totalIncome * 0.05)}/yr into wealth-building.`,
        cta: { label: "Open savings optimizer", href: "/expenses/savings" },
        priority: 70,
      });
    } else if (savingsRate >= 0.25) {
      insights.push({
        id: "high-savings",
        severity: "positive",
        headline: `Strong ${(savingsRate * 100).toFixed(1)}% savings rate`,
        detail: `Above the 25% threshold favoured by FIRE planners. Keep automated transfers running and rebalance annually.`,
        priority: 35,
      });
    }
  }

  // ── 6. Net-worth trajectory ─────────────────────────────────
  if (last && first) {
    const cagr = first.netWorth > 0
      ? Math.pow(last.netWorth / first.netWorth, 1 / Math.max(1, last.year - first.year)) - 1
      : 0;
    if (cagr > 0.07) {
      insights.push({
        id: "wealth-trajectory",
        severity: "positive",
        headline: `Net-worth CAGR projecting ${(cagr * 100).toFixed(1)}%/yr`,
        detail: `From ${fmtTHB(first.netWorth)} today to ${fmtTHB(last.netWorth)} by ${last.year} (age ${last.age}).`,
        metric: { label: "Final NW", value: fmtTHB(last.netWorth) },
        priority: 30,
      });
    }
  }

  // Sort by priority desc
  return insights.sort((a, b) => b.priority - a.priority);
}
