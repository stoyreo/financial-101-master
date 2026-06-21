/**
 * POST /api/investments/rmf-top-funds
 *
 * AI-powered, ON-DEMAND research: finds the top-performing Thai RMF
 * (Retirement Mutual Fund) funds that qualify for personal income tax relief,
 * ranked by year-over-year (1-year) return. Mirrors the "hybrid, capped"
 * web-research pattern used by /api/investments/recommendation — talks to the
 * Anthropic API directly (Claude's server-side web_search tool), capped at a
 * small number of searches so a single click can't run away with tokens.
 *
 * Model: Claude Haiku 4.5 (cheap + fast for an on-demand button).
 *
 * Body: {} (no input required — pure market research)
 *
 * Returns:
 *   { asOf, funds: [{ rank, code, name, manager, yoyReturnPct, riskLevel, riskBreakdown, note }],
 *     sources[], usage }
 *
 * riskLevel is NOT taken at face value from the model — it's recomputed
 * server-side from riskBreakdown (geopolitics / wealth / stability, each with
 * up to 3 named sub-indicators) via a fixed, documented formula, so the final
 * 1-8 number is explainable rather than a single AI-asserted digit.
 *
 * Each click is a deliberate, user-initiated request — nothing runs on load.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_WEB_SEARCHES = 3; // hard cap → bounds token/cost per click

const SYSTEM = `You are a Thai personal-finance research assistant. Find the CURRENT top-performing
Thai RMF (Retirement Mutual Fund) funds that qualify for personal income tax relief under Thai law
(deductible up to 30% of assessable income, max ฿500,000 combined with PVD/SSF).

Use the web_search tool SPARINGLY (you have at most ${MAX_WEB_SEARCHES} searches) to find real,
currently-offered RMF funds and their year-over-year (1-year, or most recent full-year) returns.
Prefer reputable sources (WealthMagik, Morningstar Thailand, Finnomena, AMC fact sheets, SEC Thailand).
Rank by YoY return, descending. Do NOT invent funds or figures — every fund and number must come from
something you actually found.

For EACH fund, also assess risk along three categories — geopolitics, wealth/economic, and
stability — using up to 3 short, concrete sub-indicators per category (named facts you can point
to, not vague adjectives), each scored 1 (low risk) to 5 (high risk):
  - geopolitics: country/region concentration, currency/FX exposure (hedged vs unhedged),
    regulatory exposure (policy/rate/capital-control sensitivity)
  - wealth: sector concentration, valuation level vs history, economic-cycle sensitivity
  - stability: historical volatility, max drawdown (3-5yr), fund durability (AUM size / manager tenure)
Only include sub-indicators you can actually support from what you found — fewer than 3 is fine,
do not pad with filler. Do NOT compute the final 1-8 riskLevel yourself; the server derives it from
your category scores.

OUTPUT: After any searching, your FINAL message must be STRICT JSON only — no prose, no markdown
fences, matching exactly this schema:
{
  "asOf": string,                              // ISO date you consider the data current as of
  "funds": [                                   // top 5, ranked by YoY return descending
    {
      "rank": number,
      "code": string,                          // official fund ticker/code
      "name": string,                          // fund name
      "manager": string,                       // AMC / fund house
      "yoyReturnPct": number,                  // most recent 1-year return, as a percentage e.g. 18.4
      "riskBreakdown": {
        "geopolitics": { "score": number, "indicators": [{ "name": string, "note": string }] },
        "wealth": { "score": number, "indicators": [{ "name": string, "note": string }] },
        "stability": { "score": number, "indicators": [{ "name": string, "note": string }] }
      },
      "note": string                           // 1 short sentence: asset class / why it ranks here
    }
  ],
  "sources": [
    { "title": string, "url": string }
  ]
}`;

type RiskCategory = { score: number; indicators: { name: string; note: string }[] };
type RiskBreakdown = { geopolitics: RiskCategory; wealth: RiskCategory; stability: RiskCategory };

/**
 * Deterministic, documented mapping from the three 1-5 category scores to the
 * final 1-8 Thai-SEC-style risk number — averages the three categories, then
 * linearly rescales 1-5 → 1-8. Kept server-side (not the model's own number)
 * so the figure is reproducible and explainable from its inputs.
 */
function computeOverallRisk(b: RiskBreakdown | undefined): number {
  if (!b) return 0;
  const scores = [b.geopolitics?.score, b.wealth?.score, b.stability?.score].filter(
    (s): s is number => typeof s === "number" && s > 0,
  );
  if (scores.length === 0) return 0;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length; // 1-5
  const rescaled = 1 + (avg - 1) * (7 / 4); // 1-5 → 1-8
  return Math.min(8, Math.max(1, Math.round(rescaled)));
}

function err(reason: string, message: string, status: number) {
  return NextResponse.json({ error: "ai_unavailable", reason, message }, { status });
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err(
      "no_api_key",
      "ANTHROPIC_API_KEY is not configured on the server, so live web-researched fund rankings are unavailable.",
      503,
    );
  }

  try {
    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            "Research and rank the top 5 currently-offered Thai RMF funds eligible for personal " +
            "income tax relief, by year-over-year return. Return STRICT JSON only as specified.",
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_WEB_SEARCHES,
        } as any,
      ],
    });

    const textOut = (msg.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("")
      .trim();

    const citationSources: { title: string; url: string }[] = [];
    for (const b of msg.content as any[]) {
      if (b.type === "text" && Array.isArray(b.citations)) {
        for (const c of b.citations) {
          if (c?.url) citationSources.push({ title: c.title || c.url, url: c.url });
        }
      }
    }

    const jsonStr = extractJson(textOut);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const truncated = (msg as any)?.stop_reason === "max_tokens";
      return NextResponse.json(
        {
          error: "parse_failed",
          reason: truncated ? "response_truncated" : "model_did_not_return_valid_json",
          message: truncated
            ? "The fund research was cut off before finishing. Please try again."
            : "The AI responded but didn't return usable fund data. Please try again.",
          raw: textOut,
        },
        { status: 502 },
      );
    }

    const merged = new Map<string, { title: string; url: string }>();
    for (const s of [...(parsed.sources ?? []), ...citationSources]) {
      if (s?.url && !merged.has(s.url)) merged.set(s.url, { title: s.title || s.url, url: s.url });
    }
    parsed.sources = Array.from(merged.values());
    parsed.funds = Array.isArray(parsed.funds)
      ? parsed.funds.slice(0, 5).map((f: any) => ({
          ...f,
          riskLevel: computeOverallRisk(f.riskBreakdown),
        }))
      : [];

    const usage = {
      inputTokens: msg.usage?.input_tokens ?? null,
      outputTokens: msg.usage?.output_tokens ?? null,
      webSearches: (msg.usage as any)?.server_tool_use?.web_search_requests ?? 0,
      model: MODEL,
    };

    return NextResponse.json({ ...parsed, usage, source: "claude-live" });
  } catch (e: any) {
    console.error("rmf-top-funds error:", e);
    const raw = String(e?.message ?? "");
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return err("insufficient_credits", "Anthropic credits exhausted.", 402);
    }
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return err("auth_failed", "Anthropic authentication failed server-side.", 401);
    }
    if (/rate limit|429/i.test(raw)) {
      return err("rate_limited", "Anthropic rate-limited the request. Try again shortly.", 429);
    }
    return err("unknown", raw || "RMF fund research request failed.", 500);
  }
}
