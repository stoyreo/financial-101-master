/**
 * POST /api/investments/scbgoldhrmf-forecast
 *
 * Uses Claude claude-sonnet-4-6 to generate an AI-powered forward-return forecast
 * for the SCBGOLDHRMF gold RMF (SCB Gold THB Hedged).
 *
 * Historical data is sourced from WealthMagik (23 Apr 2026) and embedded via
 * the shared fund-registry.
 *
 * The client caches the response in sessionStorage with a 24-hour TTL so
 * re-opening the investments page does not trigger a new API call.
 *
 * Response shape:
 * {
 *   asOf: string,                  // ISO date
 *   fundCode: string,              // "SCBGOLDHRMF"
 *   estimatedReturn: number,       // best-estimate annual return, e.g. 0.06
 *   low: number,                   // conservative bound, e.g. 0.02
 *   high: number,                  // optimistic bound, e.g. 0.11
 *   explanation: string,           // 3–4 sentence plain-English rationale
 *   keyFactors: string[],          // 3–5 bullet points
 *   methodology: string,           // brief methodology note
 *   vsOldDefault: string,          // "The previous 7% default was …"
 *   source: "ai" | "fallback"
 *   usage: {
 *     inputTokens: number | null;
 *     outputTokens: number | null;
 *     remainingTokens: number | null;   // anthropic-ratelimit-tokens-remaining
 *     tokenLimit: number | null;        // anthropic-ratelimit-tokens-limit
 *   }
 * }
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SCBGOLDHRMF, fundSummaryForPrompt } from "@/lib/fund-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Fallback (no API key or AI error) ─────────────────────────────────────────
const FALLBACK: Record<string, unknown> = {
  asOf: new Date().toISOString().slice(0, 10),
  fundCode: "SCBGOLDHRMF",
  estimatedReturn: 0.06,
  low: 0.02,
  high: 0.11,
  explanation:
    "Gold is a non-yielding real asset with long-run nominal returns of 4–6% p.a., driven by inflation and real-rate dynamics. " +
    "SCBGOLDHRMF is a THB-hedged feeder to SPDR Gold Trust, so returns closely track USD gold price with minimal tracking error. " +
    "Recent performance (2015–2025 CAGR ~10.67% annualised, 1Y +34.43%) reflects central bank gold buying, geopolitical uncertainty, and real-rate compression — likely unsustainable. " +
    "For a long-term retirement horizon, a 5–7% estimate balances recent strength with mean-reverting long-run fundamentals.",
  keyFactors: [
    "Non-yielding commodity: returns driven purely by USD price appreciation plus hedging costs",
    "Recent decade (2015–2025) annualised return: 10.67% — highest among recent 5Y/10Y/inception windows",
    "Long-run nominal return: 4–6% p.a.; long-run real return ~1–3% p.a. over very long horizons",
    "Central bank demand (monetary tightening, geopolitical risk) and real-rate dynamics have supported recent rally; mean reversion likely over 20+ years",
    "THB-hedged structure (~90% FX hedge) via SPDR Trust removes currency risk; fund return closely tracks spot gold price",
  ],
  methodology:
    "Blends the fund's 15-year historical CAGR (5.15% inception ann.) with recent multi-period returns (1Y +34.43%, 3Y ann +26.70%) " +
    "and long-run commodity gold fundamentals. Adjusts for unsustainability of recent outperformance and mean reversion over 20+ year retirement horizon.",
  vsOldDefault:
    "The previous 7% RMF default was appropriate for diversified equity–bond RMF portfolios. " +
    "For a pure gold RMF, the expected return should be lower: 5–7% nominal is more consistent with long-run gold dynamics and recent WealthMagik data.",
  source: "fallback",
  usage: {
    inputTokens: null,
    outputTokens: null,
    remainingTokens: null,
    tokenLimit: null,
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a Thai institutional investment strategist specialising in alternative assets and RMF (Retirement Mutual Fund) analysis.

Your task: analyse the provided SCBGOLDHRMF fund data and generate a forward-looking annualised return forecast suitable for long-term retirement planning (10–30 year horizon).

Guidelines:
- Gold is a non-yielding real asset. Long-run real return is approximately 1–3%, long-run nominal return ~4–6% p.a. (inflation-adjusted over very long horizons).
- Recent decade (2015–2025) has seen exceptional returns (~10.67% annualised, 1Y +34.43%), driven by central bank gold buying, geopolitical uncertainty, and real-rate compression. Do NOT naively extrapolate this.
- SCBGOLDHRMF is ≥90% THB-hedged via SPDR Gold Trust. Fund returns track spot gold USD price minus hedging costs. Currency risk is minimal.
- Multi-period returns from WealthMagik (Apr 2026): 1Y +34.43%, 3Y ann +26.70%, 5Y ann +16.53%, 10Y ann +10.67%, inception ann +5.15%.
- The "previous default" used in the app for RMF was 7% — evaluate whether that's right for a pure gold RMF specifically.
- Be calibrated and honest. Gold is high-volatility (approx. 15.5% std dev). Recent outperformance is likely temporary.

Return STRICT JSON — no markdown fences, no prose outside the JSON:
{
  "asOf": "YYYY-MM-DD",
  "fundCode": "SCBGOLDHRMF",
  "estimatedReturn": <decimal, e.g. 0.06>,
  "low": <decimal conservative bound>,
  "high": <decimal optimistic bound>,
  "explanation": "<3–4 sentences, plain English, suitable for a non-expert investor>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>", "<factor 4>", "<factor 5>"],
  "methodology": "<1–2 sentences describing how the estimate was derived>",
  "vsOldDefault": "<1–2 sentences comparing to the previous 7% RMF default and whether to revise it>"
}`;

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ...FALLBACK, source: "fallback_no_key" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const fundSummary = fundSummaryForPrompt(SCBGOLDHRMF);

    const userPrompt = `Today is ${today}. Please analyse this gold RMF and generate a forward-return forecast.

${fundSummary}

Additional context for ${today}:
- Gold spot price (USD): trading near all-time highs in 2024–2025
- Macroeconomic backdrop: potential end of Fed rate-hike cycle, geopolitical tensions (Middle East, Ukraine), central bank accumulation
- Thai baht: slightly weak vs USD, but SCBGOLDHRMF is THB-hedged so currency fluctuation does not affect returns
- RMF universe context: typical RMF portfolios (equity-bond mix) expect 5–8% nominal returns; gold alone is more volatile and yield-free
- Investor profile: Thai retirement member with 10–30 year horizon, seeking diversification and inflation protection

Produce the best-estimate forward annual return for this gold RMF, with uncertainty bounds, for long-term retirement planning.

Return strict JSON only — no prose, no markdown.`;

    const client = new Anthropic({ apiKey });

    const { data: msg, response } = await client.messages
      .create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      })
      .withResponse();

    // Extract usage from response
    const inputTokens = msg.usage.input_tokens ?? null;
    const outputTokens = msg.usage.output_tokens ?? null;

    // Try to extract rate-limit headers
    let remainingTokens: number | null = null;
    let tokenLimit: number | null = null;
    const headers = response.headers;
    const remaining = headers.get("anthropic-ratelimit-tokens-remaining");
    const limit = headers.get("anthropic-ratelimit-tokens-limit");
    if (remaining) remainingTokens = parseInt(remaining, 10);
    if (limit) tokenLimit = parseInt(limit, 10);

    const rawText = msg.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonStr = rawText.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error(
        "scbgoldhrmf-forecast: JSON parse failed, using fallback. Raw:",
        rawText.slice(0, 300),
      );
      return NextResponse.json({
        ...FALLBACK,
        source: "fallback_parse_error",
        usage: { inputTokens, outputTokens, remainingTokens, tokenLimit },
      });
    }

    // Validate critical numeric fields are reasonable decimals
    const est = Number(parsed.estimatedReturn);
    const low = Number(parsed.low);
    const high = Number(parsed.high);

    if (
      isNaN(est) ||
      est < -0.10 ||
      est > 0.25 ||
      isNaN(low) ||
      isNaN(high)
    ) {
      return NextResponse.json({
        ...FALLBACK,
        source: "fallback_invalid_values",
        usage: { inputTokens, outputTokens, remainingTokens, tokenLimit },
      });
    }

    return NextResponse.json({
      ...parsed,
      source: "ai",
      usage: { inputTokens, outputTokens, remainingTokens, tokenLimit },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("scbgoldhrmf-forecast error:", msg);
    return NextResponse.json({
      ...FALLBACK,
      source: "fallback_error",
      usage: { inputTokens: null, outputTokens: null, remainingTokens: null, tokenLimit: null },
    });
  }
}
