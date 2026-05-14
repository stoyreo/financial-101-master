/**
 * Fund Registry — shared source of truth for known provident-fund policies.
 *
 * Each entry is keyed by the official fund policy code so any AI route can
 * import and reference it by name (making the code discoverable / indexable).
 *
 * Data source: PVDMPFEQ fact sheet as of 31 December 2025 (B.E. 2568).
 */

export interface AnnualReturn {
  yearBE: number;
  yearCE: number;
  fund: number;    // % net return
  benchmark: number;
}

export interface FundInfo {
  code: string;
  nameEN: string;
  nameTH: string;
  manager: string;
  benchmark: string;
  dataAsOf: string;              // ISO date of the fact sheet
  riskLevel: number;             // 1–8 scale
  stdDevPct: number;             // annual standard deviation %
  trackingErrorPct: number;      // TE vs benchmark %
  totalExpenseRatioPct: number;  // TER %/yr
  investmentPolicy: string;
  sectorAllocation: Record<string, number>;  // sector → % weight
  annualReturns: AnnualReturn[];
}

// ── PVDMPFEQ ──────────────────────────────────────────────────────────────────
// กองทุนสำรองเลี้ยงชีพ ไทยพาณิชย์ มาสเตอร์ฟันด์
// นโยบาย: ตราสารทุนเซ็ท อินเด็กซ์ (Equity SET Index)
// Manager: บลจ. ไทยพาณิชย์ (SCBAM)
// Underlying: 98.78% SCBSET (SET index accumulation fund)

export const PVDMPFEQ: FundInfo = {
  code: "PVDMPFEQ",
  nameEN: "SCB Masterplan Fund — SET Index Equity Policy",
  nameTH: "กองทุนสำรองเลี้ยงชีพ ไทยพาณิชย์ มาสเตอร์ฟันด์ นโยบายตราสารทุนเซ็ท อินเด็กซ์",
  manager: "บลจ.ไทยพาณิชย์ (SCBAM)",
  benchmark: "SET Total Return Index (SET TRI) — 100%",
  dataAsOf: "2025-12-31",
  riskLevel: 6,
  stdDevPct: 10.6064,
  trackingErrorPct: 0.7017,
  totalExpenseRatioPct: 0.0745,
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

// ── Registry index (add future funds here) ────────────────────────────────────
export const FUND_REGISTRY: Record<string, FundInfo> = {
  PVDMPFEQ,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Arithmetic mean of annual returns (simple average) */
export function arithmeticMean(fund: FundInfo): number {
  const returns = fund.annualReturns.map(r => r.fund);
  return returns.reduce((s, r) => s + r, 0) / returns.length;
}

/** CAGR (geometric mean) of annual returns */
export function geometricMean(fund: FundInfo): number {
  const n = fund.annualReturns.length;
  const product = fund.annualReturns.reduce(
    (acc, r) => acc * (1 + r.fund / 100),
    1,
  );
  return (Math.pow(product, 1 / n) - 1) * 100;
}

/** Compact summary string for embedding in AI prompts */
export function fundSummaryForPrompt(fund: FundInfo): string {
  const returns = fund.annualReturns
    .map(r => `  ${r.yearCE} (BE${r.yearBE}): fund ${r.fund > 0 ? "+" : ""}${r.fund}%, benchmark ${r.benchmark > 0 ? "+" : ""}${r.benchmark}%`)
    .join("\n");

  const arith = arithmeticMean(fund).toFixed(2);
  const geom  = geometricMean(fund).toFixed(2);

  return `
FUND CODE: ${fund.code}
Name: ${fund.nameEN}
Manager: ${fund.manager}
Benchmark: ${fund.benchmark}
Data as of: ${fund.dataAsOf}
Risk level: ${fund.riskLevel}/8
Standard deviation: ${fund.stdDevPct}% p.a.
Tracking error: ${fund.trackingErrorPct}% p.a.
Total expense ratio: ${fund.totalExpenseRatioPct}% p.a.
Investment policy: ${fund.investmentPolicy}

Annual returns (${fund.annualReturns[0].yearCE}–${fund.annualReturns[fund.annualReturns.length - 1].yearCE}):
${returns}

Arithmetic mean: ${arith}%/yr
CAGR (geometric mean): ${geom}%/yr
`.trim();
}
