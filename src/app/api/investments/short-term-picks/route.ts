/**
 * POST /api/investments/short-term-picks
 *
 * AI-powered, ON-DEMAND short-term (7–14 day) US stock scanner. It needs a
 * LIVE web-search tool to ground picks in *current* price action, earnings
 * dates, and momentum — nothing here can come from training data — so it
 * talks to search-capable providers directly instead of the generic
 * ai-provider chain:
 *
 *   claude (default) — Claude Haiku 4.5 + `web_search` (capped via max_uses)
 *   gemini           — Gemini Flash + Google Search grounding (free tier)
 *
 * The ModelPicker's `x-ai-provider` header selects the provider; "ollama" is
 * treated as auto because a local model has no live web search.
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
import { extractJson, repairJsonLenient, requestedProvider } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_WEB_SEARCHES = 4; // hard cap → bounds token/cost per click

// Gemini (free tier) alternative, selected via the ModelPicker's
// `x-ai-provider: gemini` header. Uses Google Search grounding instead of
// Claude's web_search tool. Local Ollama is NOT supported here (no live web
// search), so an "ollama" pref falls back to the auto behaviour.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BASE_URL = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");

type Bias = "long" | "short" | "both";

// Direction instruction injected into the system prompt. A "short" idea is a
// real tradable bearish setup (borrow & sell, profit if it falls) — distinct
// from "avoid", which just flags a long to skip.
const biasInstruction = (bias: Bias) =>
  bias === "short"
    ? `Focus on SHORT candidates (direction "short") — liquid names likely to FALL over the window on a near-term negative catalyst, technical breakdown, or fading momentum. These are real bearish trades (borrow-and-sell), NOT just stocks to avoid. You may include at most one "long" for contrast.`
    : bias === "long"
      ? `Skew LONG candidates (direction "long"); you may include at most one "avoid" (a stock facing a near-term negative catalyst) for contrast.`
      : `Give a balanced MIX of LONG (direction "long") and SHORT (direction "short") candidates — wherever you see the clearest edge in either direction. Include at least one of each if the tape supports it. A "short" is a real bearish trade, not merely a stock to avoid.`;

const ultraShortNote = (horizonDays: number) =>
  horizonDays <= 5
    ? `

IMPORTANT — ULTRA-SHORT window (${horizonDays} trading days): only candidates whose
catalyst lands INSIDE the window qualify (earnings/events dated within ${horizonDays} trading
days, or momentum already in motion). Expected-move bands must be proportionally tighter
than a 2-week view, and confidence even more conservative — most ${horizonDays}-day moves
are noise.`
    : "";

const analystIntro = (horizonDays: number, bias: Bias, searchInstruction: string) => `You are a disciplined US-equity tactical analyst. The user wants SHORT-TERM
(~${horizonDays} trading day) idea candidates from LIQUID S&P 500 large-cap stocks only.

${searchInstruction} ground everything in what is
happening RIGHT NOW: recent price action / momentum, upcoming earnings dates, analyst
actions, sector rotation, macro events (Fed, CPI, jobs) inside the window. Prefer
reputable sources (major financial press, exchange/company IR pages, Morningstar).
Do NOT invent prices, dates, or figures — only report what you actually found.

Pick 4-6 candidates. ${biasInstruction(bias)} Be quantitative and honest:
short-horizon prediction is low-signal, so calibrate confidence conservatively
(a confidence above 75 should be rare).${ultraShortNote(horizonDays)}`;

const systemPrompt = (horizonDays: number, bias: Bias) => `${analystIntro(horizonDays, bias, `Use the web_search tool (at most ${MAX_WEB_SEARCHES} searches) to`)}

WORKFLOW: First, use web_search (at most ${MAX_WEB_SEARCHES} searches) to gather what you need.
Once you have enough grounding, your FINAL action must be exactly ONE call to the
"submit_scan" tool with the complete result — do not call it more than once, and do not
follow it with any further searching or text. If for any reason you cannot call
"submit_scan", your final message must be STRICT JSON only (no prose, no markdown fences)
matching the same schema, as a last resort.

${SCHEMA_TEXT}`;

// Gemini path: Google Search grounding is incompatible with forced-JSON output
// mode and there is no Anthropic-style client tool, so the prompt demands
// strict JSON text and the caller parses it leniently (same fallback parser
// the Claude path already uses).
const geminiSystemPrompt = (horizonDays: number, bias: Bias) => `${analystIntro(horizonDays, bias, "Use Google Search grounding to")}

WORKFLOW: Search first to gather what you need. Then your FINAL answer must be
STRICT JSON only — no prose, no markdown fences, no commentary — matching this
schema exactly.

${SCHEMA_TEXT}`;

const SCHEMA_TEXT = `SCHEMA (the exact JSON shape to return):
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
      "direction": string,              // "long" (buy) | "short" (borrow & sell, profit if it falls) | "avoid" (a long to skip)
      "thesis": string,                 // 2 sentences max, referencing what you found
      "catalyst": string,               // the specific near-term driver (earnings, product event, macro print...)
      "catalystDate": string,           // ISO date or "" if none/unknown
      "confidence": number,             // 0-100 conviction in THIS trade working out, calibrated conservatively (a short scores high when you're confident it falls)
      "expectedMovePct": {              // expected % move of the UNDERLYING STOCK PRICE over the horizon, regardless of trade direction — so a SHORT idea has a NEGATIVE base (price drops)
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
            direction: { type: "string", description: '"long" (buy) | "short" (borrow & sell, profit if it falls) | "avoid" (a long to skip)' },
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

  // Which provider runs the scan?
  //   gemini          → Gemini Flash + Google Search grounding (free tier)
  //   claude          → Claude + web_search (existing flow)
  //   auto / ollama   → Claude when keyed, else Gemini when keyed
  // (Ollama is treated as auto: a local model has no live web search.)
  const requested = requestedProvider(req);
  const useGemini =
    requested === "gemini" || (requested !== "claude" && !apiKey && !!GEMINI_API_KEY);

  if (useGemini && !GEMINI_API_KEY) {
    return err(
      "no_api_key",
      "GEMINI_API_KEY is not configured on the server, so the Gemini scan is unavailable. Switch the model picker to Auto or Claude.",
      503,
    );
  }
  if (!useGemini && !apiKey) {
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
    // Direction bias: which side(s) the scan should surface. Defaults to "both".
    const biasRaw = typeof body?.direction === "string" ? body.direction.toLowerCase() : "both";
    const bias: Bias = biasRaw === "short" ? "short" : biasRaw === "long" ? "long" : "both";

    const today = new Date().toISOString().slice(0, 10);
    const biasAsk =
      bias === "short"
        ? "I specifically want SHORT (bearish) trades — names likely to fall."
        : bias === "long"
          ? "I want LONG (bullish) trades."
          : "I want a mix of LONG and SHORT trades.";
    const userPrompt = `Today is ${today}. My risk profile: ${riskProfile}. ${biasAsk}
Scan the current US large-cap tape and give me your best ${horizonDays}-trading-day candidates.
Focus on liquid S&P 500 names with a clearly identifiable near-term catalyst or momentum setup.
Return STRICT JSON only as specified.`;

    // One Gemini attempt: Google Search grounding + strict-JSON text answer.
    // Returns the same shape as the Claude attempt so all downstream handling
    // (retry, clamping, source merging) is provider-agnostic.
    const attemptGeminiScan = async () => {
      const res = await fetch(
        `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: geminiSystemPrompt(horizonDays, bias) }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: 0.3,
              // Gemini 2.5 "thinks" by default, which with search grounding +
              // a large JSON answer regularly exceeds an entire request
              // timeout budget. The scan needs grounded facts, not deep
              // reasoning — disable thinking for speed.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          cache: "no-store",
          // The client aborts at 90s; stay just inside it so a slow Gemini
          // answer surfaces a real server error instead of a client abort.
          signal: AbortSignal.timeout(85_000),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`gemini_http_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      }
      const data: any = await res.json();
      const candidate = data?.candidates?.[0];
      const textOut = ((candidate?.content?.parts ?? []) as any[])
        .map((p) => p?.text ?? "")
        .join("")
        .trim();

      let parsed: any = null;
      for (const c of [extractJson(textOut), extractJson(repairJsonLenient(textOut))]) {
        try {
          parsed = JSON.parse(c);
          break;
        } catch {
          /* try the next candidate */
        }
      }

      // Grounding chunks → fallback source list (mirrors Claude citations).
      const citationSources: { title: string; url: string }[] = [];
      for (const c of (candidate?.groundingMetadata?.groundingChunks ?? []) as any[]) {
        if (c?.web?.uri) citationSources.push({ title: c.web.title || c.web.uri, url: c.web.uri });
      }

      const usage = {
        inputTokens: data?.usageMetadata?.promptTokenCount ?? null,
        outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
        webSearches: ((candidate?.groundingMetadata?.webSearchQueries ?? []) as any[]).length,
        model: GEMINI_MODEL,
      };

      return { parsed, citationSources, usage, textOut, stopReason: candidate?.finishReason ?? null };
    };

    // One Anthropic attempt: web_search grounding + a structured `submit_scan`
    // tool the model calls as its final action. Returns the parsed scan (or
    // null) plus raw text, citations, usage, and stop_reason so the caller can
    // retry / fall back / diagnose.
    const attemptClaudeScan = async () => {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: MODEL,
        // Headroom so the final result (pulse + 4-6 picks + sources) isn't
        // truncated mid-object after web_search consumes context.
        max_tokens: 8192,
        system: systemPrompt(horizonDays, bias),
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

    const attemptScan = useGemini ? attemptGeminiScan : attemptClaudeScan;

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

    return NextResponse.json({ ...parsed, usage, source: useGemini ? "gemini-flash" : "claude-live" });
  } catch (e: any) {
    console.error("short-term-picks error:", e);
    const raw = String(e?.message ?? "");
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return err("insufficient_credits", "Anthropic credits exhausted.", 402);
    }
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return err("auth_failed", "Anthropic authentication failed server-side.", 401);
    }
    if (/rate limit|429|RESOURCE_EXHAUSTED/i.test(raw)) {
      return err("rate_limited", "The AI provider rate-limited the request. Try again shortly.", 429);
    }
    if (/gemini_http_40[13]/.test(raw)) {
      return err("auth_failed", "Gemini authentication failed server-side (check GEMINI_API_KEY).", 401);
    }
    if (/aborted due to timeout|TimeoutError/i.test(raw)) {
      return err("timeout", "The AI scan took too long and timed out. Please try again.", 504);
    }
    return err("unknown", raw || "AI stock scan request failed.", 500);
  }
}
