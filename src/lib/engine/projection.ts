/**
 * projection.ts — Pure investment projection math.
 * No AI, no side-effects, deterministic. Used by the Scenario Simulator.
 */

export type AccountInput = {
  id: string;
  name: string;
  marketValue: number;
  monthlyContribution: number;
  annualContribution: number;
  expectedAnnualReturn: number;   // 0.07 = 7%
  isTaxAdvantaged: boolean;
};

export type ProjectionOpts = {
  inflationPct?: number;           // e.g. 0.03 — subtracted from nominal return
  applyTaxDrag?: boolean;
  taxDragPct?: number;             // 0.15 default (only on non-tax-advantaged growth)
};

/**
 * Return a series of length `years + 1` (index 0 = today, index N = year N).
 */
export function projectAccount(
  acc: AccountInput,
  years: number,
  opts: ProjectionOpts = {},
): number[] {
  const { inflationPct = 0, applyTaxDrag = false, taxDragPct = 0.15 } = opts;

  const taxDrag =
    applyTaxDrag && !acc.isTaxAdvantaged ? taxDragPct * acc.expectedAnnualReturn : 0;

  const r = acc.expectedAnnualReturn - taxDrag - inflationPct;
  const contrib = acc.monthlyContribution * 12 + acc.annualContribution;

  return Array.from({ length: years + 1 }, (_, yr) => {
    if (yr === 0) return Math.round(acc.marketValue);
    const fv =
      acc.marketValue * Math.pow(1 + r, yr) +
      (r !== 0
        ? contrib * ((Math.pow(1 + r, yr) - 1) / r)
        : contrib * yr);
    return Math.round(Math.max(0, fv));
  });
}

export type AccountSeries = {
  accountId: string;
  name: string;
  series: number[];   // length = years + 1
};

export function projectPortfolio(
  accounts: AccountInput[],
  years: number,
  opts: ProjectionOpts = {},
): AccountSeries[] {
  return accounts.map(a => ({
    accountId: a.id,
    name: a.name,
    series: projectAccount(a, years, opts),
  }));
}

/** Sum all account series into a single portfolio total series. */
export function sumSeries(accountSeries: AccountSeries[]): number[] {
  if (accountSeries.length === 0) return [];
  const len = accountSeries[0].series.length;
  const totals = new Array<number>(len).fill(0);
  for (const as of accountSeries) {
    for (let i = 0; i < len; i++) {
      totals[i] += as.series[i];
    }
  }
  return totals;
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────

export type MonteCarloBands = {
  p10: number[];
  p50: number[];
  p90: number[];
};

/**
 * Box-Muller normal sample — seeded variant using a simple LCG.
 */
function lcgNext(seed: number): number {
  return (seed * 1664525 + 1013904223) & 0xffffffff;
}
function lcgFloat(seed: number): [number, number] {
  const s1 = lcgNext(seed);
  const s2 = lcgNext(s1);
  return [((s1 >>> 0) / 0xffffffff), s2];
}

function normalSample(mu: number, sigma: number, seed: number): [number, number] {
  const [u1, nextSeed] = lcgFloat(seed);
  const [u2] = lcgFloat(nextSeed);
  const u1safe = Math.max(u1, 1e-10);
  const z = Math.sqrt(-2 * Math.log(u1safe)) * Math.cos(2 * Math.PI * u2);
  return [mu + sigma * z, nextSeed];
}

/**
 * Run `runs` Monte Carlo paths. Each year's return is sampled as
 *   N(meanR, volPct)
 * aggregated across all accounts (contributions use deterministic meanR).
 * Returns P10/P50/P90 series of length `years + 1`.
 */
export function monteCarlo(
  accounts: AccountInput[],
  years: number,
  runs = 500,
  volPct = 0.15,
  seed = 42,
  opts: ProjectionOpts = {},
): MonteCarloBands {
  const { inflationPct = 0, applyTaxDrag = false, taxDragPct = 0.15 } = opts;

  // Precompute effective mean return per account
  const effectiveReturns = accounts.map(a => {
    const taxDrag = applyTaxDrag && !a.isTaxAdvantaged ? taxDragPct * a.expectedAnnualReturn : 0;
    return a.expectedAnnualReturn - taxDrag - inflationPct;
  });

  // Weighted portfolio vol — simplified: use weighted mean return's vol
  const totalValue = accounts.reduce((s, a) => s + Math.max(a.marketValue, 1), 0);

  // Run simulations
  const finalValues: number[][] = Array.from({ length: years + 1 }, () => []);

  let rngSeed = seed;

  for (let run = 0; run < runs; run++) {
    // Per-account balances
    const balances = accounts.map(a => a.marketValue);

    finalValues[0].push(balances.reduce((s, v) => s + v, 0));

    for (let yr = 1; yr <= years; yr++) {
      let total = 0;

      for (let ai = 0; ai < accounts.length; ai++) {
        const acc = accounts[ai];
        const mu = effectiveReturns[ai];

        // Weight vol by account size for sampling
        const weight = Math.max(acc.marketValue, 1) / totalValue;
        const sigma = volPct * weight + volPct * (1 - weight) * 0.5;

        const [sampledReturn, nextSeed] = normalSample(mu, sigma, rngSeed);
        rngSeed = nextSeed;

        const r = sampledReturn;
        const contrib = acc.monthlyContribution * 12 + acc.annualContribution;

        balances[ai] = Math.max(
          0,
          balances[ai] * (1 + r) + contrib,
        );
        total += balances[ai];
      }

      finalValues[yr].push(Math.round(total));
    }
  }

  // Extract percentiles
  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[Math.min(idx, sorted.length - 1)];
  };

  return {
    p10: finalValues.map(yr => percentile(yr, 10)),
    p50: finalValues.map(yr => percentile(yr, 50)),
    p90: finalValues.map(yr => percentile(yr, 90)),
  };
}
