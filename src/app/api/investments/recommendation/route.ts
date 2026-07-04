/**
 * POST /api/investments/recommendation
 *
 * AI-powered, ON-DEMAND portfolio recommendation. Unlike the Ollama-first
 * routes, this one talks to the Anthropic API directly because it uses
 * Claude's server-side `web_search` tool (Ollama can't browse). Web search is
 * CAPPED (max_uses) so a single click can't run away with tokens — this is the
 * "hybrid, capped" research mode chosen for the feature.
 *
 * Model: Claude Haiku 4.5 (cheap + fast for an on-demand button).
 *
 * Body: { investments: PlanAccount[], profile, totals: { totalValue,
 *         monthlyContribs, weightedReturn, taxAdvantaged } }
 *
 * Returns structured JSON:
 *   { headline, overallVerdict, summary, projection, recommendations[],
 *     allocation[], sources[], usage }
 *
 * Each click is a deliberate, user-initiated request — nothing runs on load.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_WEB_SEARCHES = 3; // hard cap → bounds token/cost per click

const SYSTEM = `You are a CFP-level Thai personal-finance advisor. The user will give you their
CURRENT investment plan (accounts, values, returns, contributions) plus a profile.

Use the web_search tool SPARINGLY (you have at most ${MAX_WEB_SEARCHES} searches) to ground your
advice in CURRENT external sources — e.g. recent SET index outlook, Thai fund category performance,
RMF/SSF tax rules for the current tax year, gold/bond outlook, inflation. Only search for facts that
genuinely change the recommendation. Prefer reputable sources (SET, Morningstar, AMC fact sheets,
Bank of Thailand, major financial press).

Then return a recommendation. Be specific and quantitative. Use ฿ for THB. Ground every external
claim in something you actually found; do NOT invent figures.

OUTPUT: After any searching, your FINAL message must be STRICT JSON only — no prose, no markdown
fences, matching exactly this schema:
{
  "headline": string,                         // <=12 words, the core message
  "overallVerdict": string,                   // one of: "well-positioned" | "needs-rebalancing" | "under-diversified" | "over-conservative" | "over-aggressive"
  "summary": string,                          // 2-3 sentences assessing the current plan
  "projection": {                             // simple growth estimate for the current plan
    "horizonYears": number,
    "estimatedValue": number,                 // projected THB portfolio value at horizon
    "assumptionNote": string                  // 1 sentence on the return assumption used
  },
  "recommendations": [                        // 3-5 concrete, prioritized actions
    {
      "title": string,
      "rationale": string,                    // why, referencing the user's numbers and any source
      "priority": string,                     // "high" | "medium" | "low"
      "impact": string                        // expected effect, e.g. "+฿X/yr tax saved" or "lower drawdown risk"
    }
  ],
  "allocation": [                             // suggested target mix (should sum ~100)
    { "label": string, "currentPct": number, "suggestedPct": number }
  ],
  "sources": [                               // external sources you actually used
    { "title": string, "url": string }
  ]
}`;

function err(reason: string, message: string, status: number) {
  return NextResponse.json({ error: "ai_unavailable", reason, message }, { status });
}

type PlanAccount = {
  name: string;
  accountType: string;
  assetDescription?: string;
  marketValue: number;
  expectedAnnualReturn: number;
  monthlyContribution: number;
  annualContribution: number;
  isTaxAdvantaged: boolean;
  currency?: string;
};

export async function POST(req: Request) {
  const guard = await requireAiUser(req);
  if (!guard.ok) return guard.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err(
      "no_api_key",
      "ANTHROPIC_API_KEY is not configured on the server, so live web-researched recommendations are unavailable.",
      503,
    );
  }

  try {
    const body = await req.json();
    const investments: PlanAccount[] = Array.isArray(body?.investments) ? body.investments : [];
    const profile = body?.profile ?? {};
    const totals = body?.totals ?? {};
    const horizonYears: number = Number(body?.horizonYears) || 20;

    if (investments.length === 0) {
      return err("empty_plan", "No active investment accounts to analyze.", 400);
    }

    const accountLines = investments
      .map((a) => {
        const contrib = (a.monthlyContribution || 0) * 12 + (a.annualContribution || 0);
        return `- ${a.name} [${a.accountType}${a.isTaxAdvantaged ? ", tax-advantaged" : ""}]: value ฿${Math.round(
          a.marketValue,
        ).toLocaleString()}, assumed return ${(a.expectedAnnualReturn * 100).toFixed(1)}%, contributions ฿${Math.round(
          contrib,
        ).toLocaleString()}/yr${a.assetDescription ? ` — ${a.assetDescription}` : ""}`;
      })
      .join("\n");

    const userPrompt = `MY CURRENT INVESTMENT PLAN
Profile: age ${profile?.age ?? "unknown"}, retirement age ${profile?.retirementAge ?? "unknown"}, risk profile ${
      profile?.riskProfile ?? "moderate"
    }, country ${profile?.country ?? "Thailand"}.
Planning horizon: ${horizonYears} years.

Portfolio totals:
- Total value: ฿${Math.round(totals?.totalValue ?? 0).toLocaleString()}
- Tax-advantaged value: ฿${Math.round(totals?.taxAdvantaged ?? 0).toLocaleString()}
- Total contributions: ฿${Math.round(totals?.monthlyContribs ?? 0).toLocaleString()}/month
- Value-weighted expected return: ${((totals?.weightedReturn ?? 0) * 100).toFixed(1)}%

Accounts:
${accountLines}

Research current Thai market/fund/tax conditions where it matters, then give me a recommendation.
Return STRICT JSON only as specified.`;

    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model: MODEL,
      // Headroom so the final JSON (verdict + 3-5 recs + allocation + sources)
      // isn't truncated mid-object after web_search consumes context — a
      // truncated object is the other common cause of a parse failure.
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_WEB_SEARCHES,
        } as any,
      ],
    });

    // Concatenate all final text blocks (the model emits JSON in text after tool use).
    const textOut = (msg.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("")
      .trim();

    // Collect citations the web_search tool attached to text blocks, as a
    // fallback source list in case the model under-reports in JSON.
    const citationSources: { title: string; url: string }[] = [];
    for (const b of msg.content as any[]) {
      if (b.type === "text" && Array.isArray(b.citations)) {
        for (const c of b.citations) {
          if (c?.url) citationSources.push({ title: c.title || c.url, url: c.url });
        }
      }
    }

    // The web_search tool makes the model emit narration text blocks before
    // (and sometimes after) the final JSON, all of which get concatenated into
    // textOut above. extractJson slices out the balanced JSON object so leading
    // "Let me research…" prose doesn't break JSON.parse.
    const jsonStr = extractJson(textOut);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // If the model stopped because it hit the token cap, the JSON is
      // truncated — say so plainly rather than blaming a parse error.
      const truncated = (msg as any)?.stop_reason === "max_tokens";
      return NextResponse.json(
        {
          error: "parse_failed",
          reason: truncated ? "response_truncated" : "model_did_not_return_valid_json",
          message: truncated
            ? "The recommendation was cut off before finishing. Please try again."
            : "The AI responded but didn't return a usable recommendation. Please try again.",
          raw: textOut,
        },
        { status: 502 },
      );
    }

    // Merge model sources with citation sources, de-duped by URL.
    const merged = new Map<string, { title: string; url: string }>();
    for (const s of [...(parsed.sources ?? []), ...citationSources]) {
      if (s?.url && !merged.has(s.url)) merged.set(s.url, { title: s.title || s.url, url: s.url });
    }
    parsed.sources = Array.from(merged.values());

    const usage = {
      inputTokens: msg.usage?.input_tokens ?? null,
      outputTokens: msg.usage?.output_tokens ?? null,
      webSearches: (msg.usage as any)?.server_tool_use?.web_search_requests ?? 0,
      model: MODEL,
    };

    return NextResponse.json({ ...parsed, usage, source: "claude-live" });
  } catch (e: any) {
    console.error("recommendation error:", e);
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
    return err("unknown", raw || "AI recommendation request failed.", 500);
  }
}
