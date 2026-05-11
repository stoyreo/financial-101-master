/**
 * POST /api/investments/quick-insight
 *
 * Haiku 4.5 — streaming, low-latency (~400ms p95 target).
 * Returns ONE plain-English sentence about the most surprising/actionable
 * insight from the current scenario diff.
 *
 * Body: { horizonYears, basePortfolioFinalValue, scenarioPortfolioFinalValue,
 *         deltaByAccount: [{name, baseEnd, scenarioEnd, returnDelta}], presetName }
 *
 * Response: plain text stream of the insight sentence.
 */

import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You are a Thai personal-finance coach. Given a what-if scenario diff,
return ONE sentence (max 25 words) explaining the most surprising or actionable insight.
Be specific with numbers. No preamble. No JSON wrapper. Just the sentence.
Use ฿ for THB. Mention the largest single driver of the change.`;

function aiUnavailable(reason: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: "ai_unavailable", reason, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      horizonYears = 20,
      basePortfolioFinalValue = 0,
      scenarioPortfolioFinalValue = 0,
      deltaByAccount = [],
      presetName = "Custom",
    } = body ?? {};

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return aiUnavailable("no_api_key", "ANTHROPIC_API_KEY is not configured.", 503);
    }

    const delta = scenarioPortfolioFinalValue - basePortfolioFinalValue;
    const pct = basePortfolioFinalValue > 0
      ? ((delta / basePortfolioFinalValue) * 100).toFixed(1)
      : "0";

    const accountLines = (deltaByAccount as any[])
      .sort((a, b) => Math.abs(b.scenarioEnd - b.baseEnd) - Math.abs(a.scenarioEnd - a.baseEnd))
      .slice(0, 5)
      .map((a: any) =>
        `- ${a.name}: ฿${Math.round(a.baseEnd / 1000)}K → ฿${Math.round(a.scenarioEnd / 1000)}K (return shift: ${a.returnDelta >= 0 ? "+" : ""}${(a.returnDelta * 100).toFixed(1)}%)`
      )
      .join("\n");

    const userPrompt = `Preset: ${presetName}
Horizon: ${horizonYears} years
Base portfolio final: ฿${Math.round(basePortfolioFinalValue / 1000)}K
Scenario portfolio final: ฿${Math.round(scenarioPortfolioFinalValue / 1000)}K
Delta: ${delta >= 0 ? "+" : ""}฿${Math.round(delta / 1000)}K (${pct}%)

Per-account breakdown (largest delta first):
${accountLines}`;

    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    console.error("quick-insight error:", e);
    const raw = String(e?.message ?? "");
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return aiUnavailable("insufficient_credits", "Anthropic credits exhausted.", 402);
    }
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return aiUnavailable("auth_failed", "Anthropic auth failed.", 401);
    }
    if (/rate limit|429/i.test(raw)) {
      return aiUnavailable("rate_limited", "Anthropic rate-limited. Try again shortly.", 429);
    }
    return aiUnavailable("unknown", raw || "AI request failed.", 500);
  }
}
