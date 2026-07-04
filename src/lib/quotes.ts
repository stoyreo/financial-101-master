/**
 * SERVER-ONLY free stock-quote fetchers, shared by:
 *   - /api/investments/watchlist-quotes  (user-clicked Refresh)
 *   - /api/cron/watchlist-alerts         (daily LINE alert cron)
 *
 * 1. Yahoo Finance v8 chart API (primary — rich meta, no API key)
 * 2. Stooq CSV (fallback — simple daily close)
 */

const FETCH_TIMEOUT_MS = 8000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type Quote = {
  ticker: string;
  price: number;
  prevClose: number | null;
  changePct: number | null;
  currency: string;
  marketState?: string;
  quotedAt: string;
  source: "yahoo" | "stooq";
};

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function fetchYahooQuote(ticker: string): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker,
    )}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const prevClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    const hasPrev = Number.isFinite(prevClose) && prevClose > 0;
    return {
      ticker,
      price,
      prevClose: hasPrev ? prevClose : null,
      changePct: hasPrev ? ((price - prevClose) / prevClose) * 100 : null,
      currency: meta?.currency || "USD",
      marketState: meta?.marketState || undefined,
      quotedAt: new Date().toISOString(),
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

export async function fetchStooqQuote(ticker: string): Promise<Quote | null> {
  try {
    // Stooq wants US tickers as "nvda.us"; header row + one data row CSV.
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const rows = text.trim().split("\n");
    if (rows.length < 2) return null;
    const cols = rows[1].split(",");
    // Symbol,Date,Time,Open,High,Low,Close,Volume
    const close = Number(cols[6]);
    const open = Number(cols[3]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const hasOpen = Number.isFinite(open) && open > 0;
    return {
      ticker,
      price: close,
      prevClose: null,
      changePct: hasOpen ? ((close - open) / open) * 100 : null, // intraday approx
      currency: "USD",
      quotedAt: new Date().toISOString(),
      source: "stooq",
    };
  } catch {
    return null;
  }
}

export async function fetchQuote(ticker: string): Promise<Quote | null> {
  return (await fetchYahooQuote(ticker)) ?? (await fetchStooqQuote(ticker));
}

/**
 * Daily closes for a ticker (oldest → newest), for scorecard grading.
 * Returns [{ date: "YYYY-MM-DD", close }] or null.
 */
export async function fetchDailyCloses(
  ticker: string,
  range: "1mo" | "3mo" | "6mo" = "3mo",
): Promise<{ date: string; close: number }[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker,
    )}?interval=1d&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    if (!ts.length || !closes.length) return null;
    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c !== null && Number.isFinite(c)) {
        out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
