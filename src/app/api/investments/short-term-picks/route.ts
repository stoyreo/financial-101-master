/**
 * POST /api/investments/short-term-picks
 *
 * AI-powered, ON-DEMAND short-term (7–14 day) US stock scanner. Like
 * /recommendation, it talks to the Anthropic API directly because it needs
 * Claude's server-side `web_search` tool to ground picks in *current* price
 * action, earnings dates, and momentum — nothing here can come from training
 * data. Web search is CAPPED (max_uses) so one click can't run away.
 *
 * Model: Claude Haiku 4.5 (cheap + fast for an on-demand button).
 *
 * Body: { riskProfile?: string, horizonDays?: number }
 *
 * Returns structured JSON:
 *   { asOf, marketPulse: { score, label, summary }, picks[], watchouts[],
 *     sources[], usage }
 *
 * Each pick carries expectedMovePct (low/base/high) + annualizedVolPct so the
 * client can run its own Monte Carlo price-path simulation without further
 * API calls.
 *
 * Each click is a deliberate, user-initiated request — nothing runs on load.
 * This is decision-support, NOT financial advice; the UI shows a disclaimer.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJson, repairJsonLenient } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_WEB_SEARCHES = 4; // hard cap → bounds token/cost per click

const systemPrompt = (horizonDays: number) => `You are a disciplined US-equity tactical analyst. The user wants SHORT-TERM
(~${horizonDays} trading day) idea candidates from LIQUID S&P 500 large-cap stocks only.

Use the web_search tool (at most ${MAX_WEB_SEARCHES} searches) to ground everything in what is
happening RIGHT NOW: recent price action / momentum, upcoming earnings dates, analyst
actions, sector rotation, macro events (Fed, CPI, jobs) inside the window. Prefer
reputable sources (major financial press, exchange/company IR pages, Morningstar).
Do NOT invent prices, dates, or figures — only report what you actually found.

Pick 4-6 candidates. Skew LONG candidates; you may include at most one "avoid"
(stock facing a near-term negative catalyst) for contrast. Be quantitative and honest:
short-horizon prediction is low-signal, so calibrate confidence conservatively
(a confidence above 75 should be rare).${horizonDays <= 5 ? `

IMPORTANT — ULTRA-SHORT window (${horizonDays} trading days): only candidates whose
catalyst lands INSIDE the window qualify (earnings/events dated within ${horizonDays} trading
days, or momentum already in motion). Expected-move bands must be proportionally tighter
than a 2-week view, and confidence even more conservative — most ${horizonDays}-day moves
are noise.` : ""}

WORKFLOW: First, use web_search (at most ${MAX_WEB_SEARCHES} searches) to gather what you need.
Once you have enough grounding, your FINAL action must be exactly ONE call to the
"submit_scan" tool with the complete result — do not call it more than once, and do not
follow it with any further searching or text. If for any reason you cannot call
"submit_scan", your final message must be STRICT JSON only (no prose, no markdown fences)
matching the same schema, as a last resort.

SCHEMA (used by both the submit_scan tool and the JSON fallback):
{
  "asOf": string,                       // e.g. "2026-07-04"
  "horizonDays": number,                // echo the requested horizon
  "marketPulse": {
    "score": number,                    // 0-100: 0 = extremely bearish for the next 7-14 days, 100 = extremely bullish
    "label": string,                    // <=3 words, e.g. "Cautiously risk-on"
    "summary": string                   // 1-2 sentences on the current tape (breadth, vol, upcoming macro)
  },
  "picks": [
    {
      "ticker": string,                 // e.g. "NVDA"
      "company": string,
      "sector": string,
      "direction": string,              // "long" | "avoid"
      "thesis": string,                 // 2 sentences max, referencing what you found
      "catalyst": string,               // the specific near-term driver (earnings, product event, macro print...)
      "catalystDate": string,           // ISO date or "" if none/unknown
      "confidence": number,             // 0-100 conviction THIS window, calibrated conservatively
      "expectedMovePct": {              // expected % TOTAL move over the horizon
        "low": number,                  // pessimistic case, e.g. -6
        "base": number,                 // central case, e.g. 3
        "high": number                  // optimistic case, e.g. 9
      },
      "annualizedVolPct": number,       // rough annualized volatility %, e.g. 35
      "riskLevel": string,              // "low" | "medium" | "high"
      "riskNote": string                // 1 sentence: what kills this trade
    }
  ],
  "watchouts": [ string ],              // 2-4 macro/market risks for the window
  "sources": [ { "title": string, "url": string } ]
}`;

// Structured "client tool" the model calls as its FINAL action instead of
// emitting free-text JSON. Anthropic guarantees `input` conforms to this
// JSON Schema, which eliminates the prose/markdown-fence/trailing-comma
// failure modes that plague free-text JSON extraction. The schema mirrors
// the one described in the system prompt above exactly.
const SUBMIT_SCAN_TOOL = {
  name: "submit_scan",
  description:
    "Submit the final short-term stock scan result. Call this exactly once, as your last action, after you have finished web_search research.",
  input_schema: {
    type: "object",
    properties: {
      asOf: { type: "string", description: 'e.g. "2026-07-04"' },
      horizonDays: { type: "number", description: "echo the requested horizon" },
      marketPulse: {
        type: "object",
        properties: {
          score: { type: "number", description: "0-100: 0 = extremely bearish, 100 = extremely bullish" },
          label: { type: "string", description: "<=3 words, e.g. 'Cautiously risk-on'" },
          summary: { type: "string", description: "1-2 sentences on the current tape" },
        },
        required: ["score", "label", "summary"],
      },
      picks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            company: { type: "string" },
            sector: { type: "string" },
            direction: { type: "string", description: '"long" | "avoid"' },
            thesis: { type: "string" },
            catalyst: { type: "string" },
            catalystDate: { type: "string", description: "ISO date or empty string" },
            confidence: { type: "number" },
            expectedMovePct: {
              type: "object",
              properties: {
                low: { type: "number" },
                base: { type: "number" },
                high: { type: "number" },
              },
              required: ["low", "base", "high"],
            },
            annualizedVolPct: { type: "number" },
            riskLevel: { type: "string", description: '"low" | "medium" | "high"' },
            riskNote: { type: "string" },
          },
          required: [
            "ticker", "company", "sector", "direction", "thesis", "catalyst",
            "catalystDate", "confidence", "expectedMovePct", "annualizedVolPct",
            "riskLevel", "riskNote",
          ],
        },
      },
      watchouts: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, url: { type: "string" } },
          required: ["title", "url"],
        },
      },
    },
    required: ["asOf", "horizonDays", "marketPulse", "picks", "watchouts", "sources"],
  },
} as const;

function err(reason: string, message: string, status: number) {
  return NextResponse.json({ error: "ai_unavailable", reason, message }, { status });
}

export async function POST(req: Request) {
  const guard = await requireAiUser(req);
  if (!guard.ok) return guard.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err(
      "no_api_key",
      "ANTHROPIC_API_KEY is not configured on the server, so live AI stock scanning is unavailable.",
      503,
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const riskProfile: string = typeof body?.riskProfile === "string" ? body.riskProfile : "moderate";
    // 3–5 day "ultra-short" mode is allowed; anything else clamps into 3..14.
    const horizonDaysRaw = Number(body?.horizonDays);
    const horizonDays = Number.isFinite(horizonDaysRaw) ? Math.min(14, Math.max(3, Math.round(horizonDaysRaw))) : 10;

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = `Today is ${today}. My risk profile: ${riskProfile}.
Scan the current US large-cap tape and give me your best ${horizonDays}-trading-day candidates.
Focus on liquid S&P 500 names with a clearly identifiable near-term catalyst or momentum setup.
Return STRICT JSON only as specified.`;

    const client = new Anthropic({ apiKey });

    // One Anthropic attempt: web_search grounding + a structured `submit_scan`
    // tool the model calls as its final action. Returns the parsed scan (or
    // null) plus raw text, citations, usage, and stop_reason so the caller can
    // retry / fall back / diagnose.
    const attemptScan = async () => {
      const msg = await client.messages.create({
        model: MODEL,
        // Headroom so the final result (pulse + 4-6 picks + sources) isn't
        // truncated mid-object after web_search consumes context.
        max_tokens: 8192,
        system: systemPrompt(horizonDays),
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: MAX_WEB_SEARCHES,
          } as any,
          SUBMIT_SCAN_TOOL as any,
        ],
        // NOTE: no tool_choice — the model must be free to web_search first,
        // then call submit_scan as instructed by the system prompt.
      });

      const content = msg.content as any[];

      // 1) PREFERRED: the model called submit_scan. Anthropic guarantees the
      //    tool `input` conforms to the JSON schema, so no text parsing needed.
      let parsed: any = null;
      const submit = content.find(
        (b) => b.type === "tool_use" && b.name === "submit_scan",
      );
      if (submit && submit.input && typeof submit.input === "object") {
        parsed = submit.input;
      }

      // Concatenate any final text blocks (free-text JSON fallback + diagnostics).
      const textOut = content
        .filter((b) => b.type === "text")
        .map((b) => b.text as string)
        .join("")
        .trim();

      // 2) FALLBACK: parse free-text JSON, repairing common model slips
      //    (markdown fences, trailing commas, smart quotes) before giving up.
      if (!parsed && textOut) {
        const candidates = [extractJson(textOut), extractJson(repairJsonLenient(textOut))];
        for (const candidate of candidates) {
          try {
            parsed = JSON.parse(candidate);
            break;
          } catch {
            /* try the next candidate */
          }
        }
      }

      // Collect citations attached by web_search as a fallback source list.
      const citationSources: { title: string; url: string }[] = [];
      for (const b of content) {
        if (b.type === "text" && Array.isArray(b.citations)) {
          for (const c of b.citations) {
            if (c?.url) citationSources.push({ title: c.title || c.url, url: c.url });
          }
        }
      }

      const usage = {
        inputTokens: msg.usage?.input_tokens ?? null,
        outputTokens: msg.usage?.output_tokens ?? null,
        webSearches: (msg.usage as any)?.server_tool_use?.web_search_requests ?? 0,
        model: MODEL,
      };

      return { parsed, citationSources, usage, textOut, stopReason: (msg as any)?.stop_reason ?? null };
    };

    const isUsable = (a: { parsed: any }) =>
      a.parsed && typeof a.parsed === "object" && Array.isArray(a.parsed.picks) && a.parsed.picks.length > 0;

    // Attempt once; auto-retry ONCE server-side before surfacing an error.
    let attempt = await attemptScan();
    if (!isUsable(attempt)) {
      console.warn("short-term-picks: first attempt returned no usable scan; retrying once.", {
        stopReason: attempt.stopReason,
      });
      attempt = await attemptScan();
    }

    const { citationSources, usage } = attempt;
    let parsed = attempt.parsed;

    if (!isUsable(attempt)) {
      const truncated = attempt.stopReason === "max_tokens";
      console.error("short-term-picks: parse_failed after retry.", {
        stopReason: attempt.stopReason,
        rawPreview: attempt.textOut.slice(0, 1200),
      });
      return NextResponse.json(
        {
          error: "parse_failed",
          reason: truncated ? "response_truncated" : "model_did_not_return_valid_json",
          message: truncated
            ? "The scan was cut off before finishing. Please try again."
            : "The AI responded but didn't return a usable scan. Please try again.",
          raw: attempt.textOut,
        },
        { status: 502 },
      );
    }

    // Clamp / sanitize numeric fields so a sloppy model answer can't break the
    // client-side gauge or Monte Carlo simulation.
    if (parsed?.marketPulse) {
      parsed.marketPulse.score = Math.min(100, Math.max(0, Number(parsed.marketPulse.score) || 50));
    }
    if (Array.isArray(parsed?.picks)) {
      parsed.picks = parsed.picks
        .filter((p: any) => p && typeof p.ticker === "string" && p.ticker.trim())
        .slice(0, 6)
        .map((p: any) => ({
          ...p,
          confidence: Math.min(100, Math.max(0, Number(p.confidence) || 0)),
          annualizedVolPct: Math.min(150, Math.max(5, Number(p.annualizedVolPct) || 30)),
          expectedMovePct: {
            low: Math.max(-50, Math.min(0, Number(p?.expectedMovePct?.low) || -5)),
            base: Math.max(-30, Math.min(30, Number(p?.expectedMovePct?.base) || 0)),
            high: Math.min(50, Math.max(0, Number(p?.expectedMovePct?.high) || 5)),
          },
        }));
    }

    // Merge model sources with citation sources, de-duped by URL.
    const merged = new Map<string, { title: string; url: string }>();
    for (const s of [...(parsed.sources ?? []), ...citationSources]) {
      if (s?.url && !merged.has(s.url)) merged.set(s.url, { title: s.title || s.url, url: s.url });
    }
    parsed.sources = Array.from(merged.values());

    return NextResponse.json({ ...parsed, usage, source: "claude-live" });
  } catch (e: any) {
    console.error("short-term-picks error:", e);
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
    return err("unknown", raw || "AI stock scan request failed.", 500);
  }
}
