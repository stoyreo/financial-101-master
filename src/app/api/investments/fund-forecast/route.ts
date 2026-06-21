/**
 * POST /api/investments/fund-forecast
 *
 * Generic AI-powered forward-return forecast for ANY fund — a built-in example
 * fund from the registry (PVDMPFEQ, SCBGOLDHRMF) or a user's own custom-added
 * fund. Replaces the old hardcoded /pvd-forecast and /scbgoldhrmf-forecast
 * routes, which only worked for those two specific SCB fund codes.
 *
 * Custom funds live client-side only (sessionStorage, per-user — see
 * fund-registry.ts), so the server has no way to look them up by code. The
 * client must send the full FundInfo object in the request body.
 *
 * Request body:
 * { fund: FundInfo }
 *
 * Response shape:
 * {
 *   asOf: string,
 *   fundCode: string,
 *   estimatedReturn: number,
 *   low: number,
 *   high: number,
 *   explanation: string,
 *   keyFactors: string[],
 *   methodology: string,
 *   vsOldDefault: string,
 *   source: "ai" | "fallback" | "fallback_parse_error" | "fallback_invalid_values" | "fallback_error",
 *   usage: { inputTokens, outputTokens, remainingTokens, tokenLimit }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { aiComplete, extractJson } from "@/lib/ai-provider";
import { fundSummaryForPrompt, type FundInfo, type AssetClass } from "@/lib/fund-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Generic long-run benchmarks per asset class, used both in the system
//    prompt and to build a sensible fallback when AI is unavailable. ──────────
const ASSET_CLASS_CONTEXT: Record<AssetClass, string> = {
  thai_equity:
    "Thai equities (SET): long-run nominal total return ~6–8% p.a. (30-yr history), " +
    "though any individual decade can deviate sharply (e.g. 2015–2025 was unusually weak).",
  gold:
    "Gold: a non-yielding real asset. Long-run nominal return ~4–6% p.a., long-run real " +
    "return ~1–3% p.a. Recent multi-year rallies (central bank buying, geopolitical risk) " +
    "are often followed by mean reversion — do not naively extrapolate a hot recent decade.",
  bond:
    "Thai fixed income / bonds: long-run nominal return ~1.5–3.5% p.a., closely tied to " +
    "Bank of Thailand policy rate and government bond yields. Low volatility, low real return.",
  mixed:
    "Mixed/balanced portfolios (equity + bond blend): long-run nominal return ~4–6% p.a., " +
    "with volatility between pure equity and pure bond depending on the equity weighting.",
  other:
    "No specific asset-class benchmark is available — use general capital-market assumptions " +
    "for a diversified Thai retirement investment (nominal ~4–6% p.a.) and widen the uncertainty band.",
};

const FALLBACK_BY_ASSET_CLASS: Record<AssetClass, { est: number; low: number; high: number }> = {
  thai_equity: { est: 0.055, low: 0.03, high: 0.085 },
  gold: { est: 0.06, low: 0.02, high: 0.11 },
  bond: { est: 0.025, low: 0.01, high: 0.04 },
  mixed: { est: 0.05, low: 0.025, high: 0.075 },
  other: { est: 0.05, low: 0.02, high: 0.08 },
};

function buildFallback(fund: FundInfo) {
  const f = FALLBACK_BY_ASSET_CLASS[fund.assetClass] ?? FALLBACK_BY_ASSET_CLASS.other;
  return {
    asOf: new Date().toISOString().slice(0, 10),
    fundCode: fund.code,
    estimatedReturn: f.est,
    low: f.low,
    high: f.high,
    explanation:
      `${fund.code} is classified as a ${fund.assetClass.replace("_", " ")} fund. ` +
      `${ASSET_CLASS_CONTEXT[fund.assetClass] ?? ASSET_CLASS_CONTEXT.other} ` +
      `This is a generic estimate based on asset-class fundamentals, not a live AI analysis.`,
    keyFactors: [
      `Asset class: ${fund.assetClass.replace("_", " ")}`,
      `Fund type: ${fund.fundType}`,
      fund.annualReturns.length > 0
        ? `${fund.annualReturns.length} years of historical returns on file`
        : "No fund-specific historical data on file — estimate is asset-class-based only",
      `Total expense ratio: ${fund.totalExpenseRatioPct}% p.a.`,
    ],
    methodology:
      "Generic asset-class-based estimate (AI service unavailable or returned invalid data).",
    vsOldDefault:
      "This is a fallback estimate — re-run the AI forecast once the service is available for a fund-specific analysis.",
    source: "fallback",
    usage: { inputTokens: null, outputTokens: null, remainingTokens: null, tokenLimit: null },
  };
}

function buildSystemPrompt(fund: FundInfo): string {
  const context = ASSET_CLASS_CONTEXT[fund.assetClass] ?? ASSET_CLASS_CONTEXT.other;
  return `You are a Thai institutional investment strategist specialising in retirement fund analysis (PVD/RMF/SSF and similar).

Your task: analyse the provided ${fund.code} fund data and generate a forward-looking annualised return forecast suitable for long-term retirement planning (10–30 year horizon).

Fund classification: ${fund.fundType} fund, asset class "${fund.assetClass}".

Asset-class context: ${context}

Guidelines:
- Weight long-run asset-class fundamentals more heavily than any single unusually strong or weak recent period.
- If historical fund-specific returns are provided below, use them — otherwise rely on the asset-class context above and general Thai market fundamentals.
- Consider fees (TER), tracking error, and risk level (1–8 scale) when shaping the uncertainty band — higher fees/risk should widen the band.
- Be calibrated and honest. Do not be overly optimistic, and do not naively extrapolate short-term outperformance or underperformance.

Return STRICT JSON — no markdown fences, no prose outside the JSON:
{
  "asOf": "YYYY-MM-DD",
  "fundCode": "${fund.code}",
  "estimatedReturn": <decimal, e.g. 0.06>,
  "low": <decimal conservative bound>,
  "high": <decimal optimistic bound>,
  "explanation": "<3–4 sentences, plain English, suitable for a non-expert investor>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>", "<factor 4>", "<factor 5>"],
  "methodology": "<1–2 sentences describing how the estimate was derived>",
  "vsOldDefault": "<1–2 sentences on how this compares to a generic default for this fund type/asset class>"
}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let fund: FundInfo | undefined;

  try {
    const body = await req.json();
    fund = body?.fund as FundInfo | undefined;
  } catch {
    // fall through to the missing-fund error below
  }

  if (!fund || !fund.code || !fund.assetClass) {
    return NextResponse.json(
      { error: "Request body must include a `fund` object (FundInfo shape)." },
      { status: 400 },
    );
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const fundSummary = fundSummaryForPrompt(fund);
    const SYSTEM = buildSystemPrompt(fund);

    const userPrompt = `Today is ${today}. Please analyse this fund and generate a forward-return forecast.

${fundSummary}

Additional context for ${today}:
- Thai interest rate environment: Bank of Thailand policy rate context should be factored in for bond/mixed funds
- SET index valuation and Thai macro conditions should be factored in for Thai-equity funds
- Global gold/commodity conditions should be factored in for gold funds
- Investor profile: Thai retirement saver with a 10–30 year horizon

Produce the best-estimate forward annual return for this fund, with uncertainty bounds.

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
      console.error(`fund-forecast(${fund.code}): JSON parse failed, using fallback. Raw:`, rawText.slice(0, 300));
      return NextResponse.json({
        ...buildFallback(fund),
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
        ...buildFallback(fund),
        source: "fallback_invalid_values",
        usage: { inputTokens, outputTokens, remainingTokens, tokenLimit },
      });
    }

    return NextResponse.json({
      ...parsed,
      fundCode: fund.code,
      source: "ai",
      usage: { inputTokens, outputTokens, remainingTokens, tokenLimit },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`fund-forecast(${fund.code}) error:`, msg);
    return NextResponse.json({
      ...buildFallback(fund),
      source: "fallback_error",
      usage: { inputTokens: null, outputTokens: null, remainingTokens: null, tokenLimit: null },
    });
  }
}
