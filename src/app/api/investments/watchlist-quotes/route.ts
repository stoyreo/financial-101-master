/**
 * POST /api/investments/watchlist-quotes
 *
 * ON-DEMAND latest-price fetch for the user's pinned watchlist (and for the
 * radar's "real dollar levels" in the simulation panel). No AI here — proxies
 * free public quote endpoints server-side via src/lib/quotes.ts (browser CORS
 * blocks them client-side).
 *
 * Auth + per-user rate limit via requireAiUser (same guard as the AI routes;
 * quotes are cheap but the endpoint still shouldn't be an open proxy).
 *
 * Body: { symbols: string[] }   (max 12, US tickers)
 * Returns: { quotes: Quote[], errors: [{ ticker, reason }], fetchedAt }
 */

import { NextResponse } from "next/server";
import { requireAiUser } from "@/lib/ai-route-guard";
import { fetchQuote, type Quote } from "@/lib/quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_SYMBOLS = 12;

export async function POST(req: Request) {
  const guard = await requireAiUser(req);
  if (!guard.ok) return guard.response;

  let symbols: string[] = [];
  try {
    const body = await req.json();
    symbols = Array.isArray(body?.symbols) ? body.symbols : [];
  } catch {
    // fall through to validation error below
  }

  symbols = symbols
    .map((s) => String(s).toUpperCase().trim())
    .filter((s) => /^[A-Z.\-]{1,10}$/.test(s));
  symbols = Array.from(new Set(symbols)).slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "no_symbols", message: "No valid tickers provided." }, { status: 400 });
  }

  const results = await Promise.all(
    symbols.map(async (t) => ({ ticker: t, quote: await fetchQuote(t) })),
  );

  const quotes = results.filter((r) => r.quote).map((r) => r.quote as Quote);
  const errors = results
    .filter((r) => !r.quote)
    .map((r) => ({ ticker: r.ticker, reason: "quote_unavailable" }));

  return NextResponse.json({ quotes, errors, fetchedAt: new Date().toISOString() });
}
