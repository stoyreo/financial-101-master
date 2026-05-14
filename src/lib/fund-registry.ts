/**
 * Fund Registry — shared source of truth for known fund policies.
 *
 * Each entry is keyed by the official fund code so any AI route can
 * import and reference it by name (making the code discoverable / indexable).
 *
 * Funds registered:
 *   PVDMPFEQ  — SCB Masterplan PVD, SET Index Equity policy (fact sheet 31 Dec 2025)
 *   SCBGOLDHRMF — SCB Gold THB Hedged RMF (data: WealthMagik / Finnomena, Apr 2026)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnnualReturn {
  yearBE: number;
  yearCE: number;
  fund: number;       // % net return (approximate for SCBGOLDHRMF)
  benchmark: number;  // % benchmark return
  approximate?: boolean;  // true when derived from gold price proxy
}

export interface MultiPeriodReturn {
  period: string;   // e.g. "1Y", "3Y_ann", "5Y_ann", "10Y_ann", "inception_ann"
  value: number;    // % annualized (or total for 1Y)
  asOf: string;     // ISO date
}

export type AssetClass = "thai_equity" | "gold" | "bond" | "mixed" | "other";

export interface FundInfo {
  code: string;
  nameEN: string;
  nameTH: string;
  manager: string;
  benchmark: string;
  dataAsOf: string;
  assetClass: AssetClass;
  fundType: "PVD" | "RMF" | "SSF" | "other";
  riskLevel: number;
  stdDevPct: number;
  trackingErrorPct: number;
  totalExpenseRatioPct: number;
  investmentPolicy: string;
  sectorAllocation: Record<string, number>;
  annualReturns: AnnualReturn[];
  multiPeriodReturns?: MultiPeriodReturn[];  // rolling periods from fund platforms
  inceptionDate?: string;                    // ISO date
}

// ── PVDMPFEQ ──────────────────────────────────────────────────────────────────
// กองทุนสำรองเลี้ยงชีพ ไทยพาณิชย์ มาสเตอร์ฟันด์
// นโยบาย: ตราสารทุนเซ็ท อินเด็กซ์ (Equity SET Index)
// Source: Official fact sheet, 31 December 2025 (B.E. 2568)

export const PVDMPFEQ: FundInfo = {
  code: "PVDMPFEQ",
  nameEN: "SCB Masterplan Fund — SET Index Equity Policy",
  nameTH: "กองทุนสำรองเลี้ยงชีพ ไทยพาณิชย์ มาสเตอร์ฟันด์ นโยบายตราสารทุนเซ็ท อินเด็กซ์",
  manager: "บลจ.ไทยพาณิชย์ (SCBAM)",
  benchmark: "SET Total Return Index (SET TRI) — 100%",
  dataAsOf: "2025-12-31",
  assetClass: "thai_equity",
  fundType: "PVD",
  riskLevel: 6,
  stdDevPct: 10.6064,
  trackingErrorPct: 0.7017,
  totalExpenseRatioPct: 0.0745,
  inceptionDate: "2010-01-01",
  investmentPolicy:
    "Invests ≥80% of NAV in SCBSET (SCB SET Index Fund accumulation class). " +
    "Remainder in money market instruments. No foreign exposure. " +
    "Passively tracks the SET Total Return Index.",
  sectorAllocation: {
    ENERGY: 18.43,
    OTHER: 16.45,
    BANKING: 15.22,
    ELECTRONICS: 14.04,
    COMMUNICATION: 8.74,
    TRANSPORTATION: 8.09,
    COMMERCE: 6.36,
    PROPERTY: 5.39,
    FOOD_BEVERAGE: 5.30,
    DEPOSITS: 1.79,
    UNITS: 0.38,
    MISC: -0.20,
  },
  annualReturns: [
    { yearBE: 2558, yearCE: 2015, fund: -12.31, benchmark: -11.23 },
    { yearBE: 2559, yearCE: 2016, fund:  21.19, benchmark:  23.85 },
    { yearBE: 2560, yearCE: 2017, fund:  16.86, benchmark:  17.30 },
    { yearBE: 2561, yearCE: 2018, fund:  -8.59, benchmark:  -8.08 },
    { yearBE: 2562, yearCE: 2019, fund:   3.48, benchmark:   4.29 },
    { yearBE: 2563, yearCE: 2020, fund:  -9.39, benchmark:  -5.24 },
    { yearBE: 2564, yearCE: 2021, fund:  14.31, benchmark:  17.67 },
    { yearBE: 2565, yearCE: 2022, fund:   3.23, benchmark:   3.53 },
    { yearBE: 2566, yearCE: 2023, fund: -14.27, benchmark: -12.66 },
    { yearBE: 2567, yearCE: 2024, fund:   1.43, benchmark:   2.33 },
    { yearBE: 2568, yearCE: 2025, fund:  -7.88, benchmark:  -5.99 },
  ],
};

// ── SCBGOLDHRMF ───────────────────────────────────────────────────────────────
// กองทุนเปิดไทยพาณิชย์โกลด์ THB เฮดจ์ เพื่อการเลี้ยงชีพ
// SCB Gold THB Hedged RMF
// Source: WealthMagik (23 Apr 2026), Finnomena, SCBAM website
//
// Annual returns are approximate, derived from LBMA gold price (USD) performance.
// The fund is ≥90% FX-hedged back to THB (via SPDR Gold Trust feeder),
// so THB returns closely mirror USD gold price returns with minor hedging-cost drag.

export const SCBGOLDHRMF: FundInfo = {
  code: "SCBGOLDHRMF",
  nameEN: "SCB Gold THB Hedged RMF",
  nameTH: "กองทุนเปิดไทยพาณิชย์โกลด์ THB เฮดจ์ เพื่อการเลี้ยงชีพ",
  manager: "บลจ.ไทยพาณิชย์ (SCBAM)",
  benchmark: "LBMA Gold Price AM (USD, hedged to THB) — via SPDR Gold Trust",
  dataAsOf: "2026-04-23",
  assetClass: "gold",
  fundType: "RMF",
  riskLevel: 8,           // highest risk — alternative asset
  stdDevPct: 15.5,        // approximate; gold typically 15–18% annual std dev
  trackingErrorPct: 0.5,  // approximate; SPDR tracker is tight
  totalExpenseRatioPct: 0.65, // approximate; gold RMFs typically ~0.5–0.8%
  inceptionDate: "2011-10-19",
  investmentPolicy:
    "Feeder fund investing ≥90% of NAV in SPDR Gold Trust (GLD). " +
    "FX risk (USD/THB) is hedged ≥90% of foreign asset value. " +
    "Fund return closely tracks spot gold price in USD, converted to THB at hedged rate. " +
    "Classified as Commodities Precious Metals (Risk Level 8/8). " +
    "RMF — qualified for Thai personal income tax deduction (≤30% of assessable income, max ฿500,000 combined RMF+SSF).",
  sectorAllocation: {
    "GOLD (SPDR Trust)": 99.0,
    CASH: 1.0,
  },
  // Approximate annual returns (proxy: LBMA gold USD price, calendar year)
  // Calibrated against WealthMagik multi-period data (23 Apr 2026):
  //   1Y: 34.43%, 3Y ann: 26.70%, 5Y ann: 16.53%, 10Y ann: 10.67%, inception ann: 5.15%
  annualReturns: [
    { yearBE: 2558, yearCE: 2015, fund: -10.5, benchmark: -10.4, approximate: true },
    { yearBE: 2559, yearCE: 2016, fund:   8.5, benchmark:   8.7, approximate: true },
    { yearBE: 2560, yearCE: 2017, fund:  13.7, benchmark:  13.5, approximate: true },
    { yearBE: 2561, yearCE: 2018, fund:  -1.9, benchmark:  -2.1, approximate: true },
    { yearBE: 2562, yearCE: 2019, fund:  18.3, benchmark:  18.9, approximate: true },
    { yearBE: 2563, yearCE: 2020, fund:  24.6, benchmark:  25.1, approximate: true },
    { yearBE: 2564, yearCE: 2021, fund:  -3.6, benchmark:  -3.6, approximate: true },
    { yearBE: 2565, yearCE: 2022, fund:  -0.3, benchmark:  -0.3, approximate: true },
    { yearBE: 2566, yearCE: 2023, fund:  13.2, benchmark:  13.1, approximate: true },
    { yearBE: 2567, yearCE: 2024, fund:  27.0, benchmark:  26.8, approximate: true },
    { yearBE: 2568, yearCE: 2025, fund:  28.5, benchmark:  28.0, approximate: true },
  ],
  multiPeriodReturns: [
    { period: "1Y",            value:  34.43, asOf: "2026-04-23" },
    { period: "3Y_ann",        value:  26.70, asOf: "2026-04-23" },
    { period: "5Y_ann",        value:  16.53, asOf: "2026-04-23" },
    { period: "10Y_ann",       value:  10.67, asOf: "2026-04-23" },
    { period: "inception_ann", value:   5.15, asOf: "2026-04-23" },
  ],
};

// ── Registry index ────────────────────────────────────────────────────────────
export const FUND_REGISTRY: Record<string, FundInfo> = {
  PVDMPFEQ,
  SCBGOLDHRMF,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function arithmeticMean(fund: FundInfo): number {
  const returns = fund.annualReturns.map(r => r.fund);
  return returns.reduce((s, r) => s + r, 0) / returns.length;
}

export function geometricMean(fund: FundInfo): number {
  const n = fund.annualReturns.length;
  const product = fund.annualReturns.reduce(
    (acc, r) => acc * (1 + r.fund / 100),
    1,
  );
  return (Math.pow(product, 1 / n) - 1) * 100;
}

/** Compact summary for embedding in AI prompts */
export function fundSummaryForPrompt(fund: FundInfo): string {
  const returnsNote = fund.annualReturns[0]?.approximate
    ? "(approximate, derived from gold USD price — fund is fully THB-hedged)"
    : "(official fact sheet data)";

  const returns = fund.annualReturns
    .map(r =>
      `  ${r.yearCE}: fund ${r.fund > 0 ? "+" : ""}${r.fund}%` +
      `, benchmark ${r.benchmark > 0 ? "+" : ""}${r.benchmark}%` +
      (r.approximate ? " [approx]" : ""),
    )
    .join("\n");

  const arith = arithmeticMean(fund).toFixed(2);
  const geom  = geometricMean(fund).toFixed(2);

  const multiPeriod = fund.multiPeriodReturns
    ? "\nVerified multi-period returns (from fund platforms):\n" +
      fund.multiPeriodReturns
        .map(m => `  ${m.period}: ${m.value > 0 ? "+" : ""}${m.value}% (as of ${m.asOf})`)
        .join("\n")
    : "";

  return `
FUND CODE: ${fund.code}
Name: ${fund.nameEN}
Thai name: ${fund.nameTH}
Manager: ${fund.manager}
Benchmark: ${fund.benchmark}
Fund type: ${fund.fundType} | Asset class: ${fund.assetClass}
Data as of: ${fund.dataAsOf}
Risk level: ${fund.riskLevel}/8
Approx. std deviation: ${fund.stdDevPct}% p.a.
Tracking error: ${fund.trackingErrorPct}% p.a.
Total expense ratio: ${fund.totalExpenseRatioPct}% p.a.
Inception: ${fund.inceptionDate ?? "N/A"}
Investment policy: ${fund.investmentPolicy}

Annual returns ${returnsNote}:
${returns}

Arithmetic mean of annual returns: ${arith}%/yr
Geometric mean / CAGR of annual returns: ${geom}%/yr${multiPeriod}
`.trim();
}
