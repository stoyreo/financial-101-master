/**
 * POST /api/investments/pvd-forecast
 *
 * Uses Claude claude-sonnet-4-6 to generate an AI-powered forward-return forecast
 * for the PVDMPFEQ provident fund (SCB SET Index policy).
 *
 * Historical data is sourced from the official fund fact sheet (31 Dec 2025)
 * and embedded via the shared fund-registry.
 *
 * The client caches the response in sessionStorage with a 24-hour TTL so
 * re-opening the investments page does not trigger a new API call.
 *
 * Response shape:
 * {
 *   asOf: string,                  // ISO date
 *   fundCode: string,              // "PVDMPFEQ"
 *   estimatedReturn: number,       // best-estimate annual return, e.g. 0.065
 *   low: number,                   // conservative bound, e.g. 0.04
 *   high: number,                  // optimistic bound, e.g. 0.09
 *   explanation: string,           // 3–4 sentence plain-English rationale
 *   keyFactors: string[],          // 3–5 bullet points
 *   methodology: string,           // brief methodology note
 *   vsOldDefault: string,          // "The previous 4% default was …"
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
import { aiComplete, extractJson } from "@/lib/ai-provider";
import { PVDMPFEQ, fundSummaryForPrompt } from "@/lib/fund-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Fallback (no API key or AI error) ─────────────────────────────────────────
const FALLBACK: Record<string, unknown> = {
  asOf: new Date().toISOString().slice(0, 10),
  fundCode: "PVDMPFEQ",
  estimatedReturn: 0.055,
  low: 0.03,
  high: 0.085,
  explanation:
    "PVDMPFEQ tracks the SET Total Return Index with very low fees (0.07% TER). " +
    "The 2015–2025 decade was unusually weak for Thai equities (CAGR near 0%), driven by political instability and global macro headwinds. " +
    "Long-run SET TRI history and mean-reversion suggest a forward estimate of ~5–6% nominal for a 20+ year retirement horizon. " +
    "A 4% default was conservative but plausible given the poor recent decade.",
  keyFactors: [
    "Low TER (0.07%) preserves nearly all market return — minimal fee drag",
    "SET long-run nominal return: ~6–8% (30-yr history), recent decade ~0% CAGR",
    "High sector concentration in Energy + Banking (33%) adds cyclical risk",
    "No foreign-currency risk — fully domestic Thai equities",
    "Mean reversion: extended underperformance historically followed by recovery",
  ],
  methodology:
    "Blends the fund's 11-year historical CAGR with Thai equity long-run expected return. " +
    "Adjusts for current SET valuation, dividend yield, and earnings growth outlook.",
  vsOldDefault:
    "The previous 4% default was conservative relative to long-run Thai equity history. " +
    "For a 20+ year retirement horizon, 5–6% is a more balanced estimate, though 4% remains appropriate for near-retirement or risk-averse members.",
  source: "fallback",
  usage: {
    inputTokens: null,
    outputTokens: null,
    remainingTokens: null,
    tokenLimit: null,
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a Thai institutional investment strategist specialising in provident fund (กองทุนสำรองเลี้ยงชีพ) analysis.

Your task: analyse the provided PVDMPFEQ fund data and generate a forward-looking annualised return forecast suitable for long-term retirement planning (10–30 year horizon).

Guidelines:
- Consider the full historical return series, but weight long-run Thai equity fundamentals more than the unusually poor 2015–2025 decade.
- SET long-run nominal total return (30+ yr): approximately 6–8% p.a. Adjust for current macro context.
- This is a passive index fund — the TER is negligible (0.07%), so no significant fee drag adjustment needed.
- The fund has no foreign-currency exposure (pure domestic Thai equities).
- High sector concentration risk (Energy 18%, Banking 15%, Electronics 14%) should widen the uncertainty band.
- The "previous default" used in the app was 4% — evaluate whether that was appropriate and suggest a better estimate.
- Be calibrated and honest. Do not be overly optimistic.

Return STRICT JSON — no markdown fences, no prose outside the JSON:
{
  "asOf": "YYYY-MM-DD",
  "fundCode": "PVDMPFEQ",
  "estimatedReturn": <decimal, e.g. 0.065>,
  "low": <decimal conservative bound>,
  "high": <decimal optimistic bound>,
  "explanation": "<3–4 sentences, plain English, suitable for a non-expert investor>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>", "<factor 4>", "<factor 5>"],
  "methodology": "<1–2 sentences describing how the estimate was derived>",
  "vsOldDefault": "<1–2 sentences comparing to the previous 4% default and whether to revise it>"
}`;

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fundSummary = fundSummaryForPrompt(PVDMPFEQ);

    const userPrompt = `Today is ${today}. Please analyse this provident fund and generate a forward-return forecast.

${fundSummary}

Additional context for ${today}:
- Thai interest rate environment: Bank of Thailand policy rate at 2.50% (2025), potential easing ahead
- SET index is trading at a multi-year discount to regional peers (P/E ~14x vs historical average ~17x)
- Thai economy: GDP growth ~2–3%, driven by tourism recovery and exports
- Global context: post-rate-hike cycle, moderating inflation, risk-asset recovery underway
- Thai baht: broadly stable, slightly weak vs USD

Produce the best-estimate forward annual return for this fund, with uncertainty bounds, for a Thai provident fund member planning retirement over a 10–30 year horizon.

Return strict JSON only — no prose, no markdown.`;

    const { text: rawText } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 800,
      json: true,
      claudeModel: "claude-sonnet-4-6",
    });

    // Token usage / rate-limit headers aren't exposed through the unified
    // provider (and don't apply to local Ollama), so report them as null.
    const inputTokens: number | null = null;
    const outputTokens: number | null = null;
    const remainingTokens: number | null = null;
    const tokenLimit: number | null = null;

    const jsonStr = extractJson(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("pvd-forecast: JSON parse failed, using fallback. Raw:", rawText.slice(0, 300));
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
      isNaN(est) || est < -0.10 || est > 0.25 ||
      isNaN(low) || isNaN(high)
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
    console.error("pvd-forecast error:", msg);
    return NextResponse.json({
      ...FALLBACK,
      source: "fallback_error",
      usage: { inputTokens: null, outputTokens: null, remainingTokens: null, tokenLimit: null },
    });
  }
}
