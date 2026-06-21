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
 *   { asOf, funds: [{ rank, code, name, manager, yoyReturnPct, riskLevel, note }],
 *     sources[], usage }
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
      "riskLevel": number,                     // 1-8 Thai SEC risk scale if known, else 0
      "note": string                           // 1 short sentence: asset class / why it ranks here
    }
  ],
  "sources": [
    { "title": string, "url": string }
  ]
}`;

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
    parsed.funds = Array.isArray(parsed.funds) ? parsed.funds.slice(0, 5) : [];

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
