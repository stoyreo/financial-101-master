/**
 * POST /api/investments/scenario-analysis
 *
 * Sonnet 4.6 — deep 3-paragraph CFP-level analysis of a scenario vs base.
 * Returns structured JSON: verdict, headline, analysis, risks, opportunities,
 * actionPlan, confidenceScore.
 *
 * Body: { scenario, baseProjection, scenarioProjection, profile }
 */

import { NextResponse } from "next/server";
import { aiComplete, AiUnavailableError, extractJson } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You are a CFP-level Thai investment advisor analyzing a what-if scenario.
Given the user's BASE projection and the SCENARIO projection, produce:
- A 1-line VERDICT: one of "conservative" | "balanced" | "moderately aggressive" | "aggressive" | "unrealistic"
- A HEADLINE (≤12 words) capturing the core trade-off
- 3 paragraphs of ANALYSIS: (1) what changes and by how much, (2) whether the return assumptions
  are realistic given Thai market history (SET TR ~6–8% long-run, RMF/SSF tax-shield benefits,
  savings rates ~1–2%, PVD 3–6%), (3) what it means for the retirement goal
- 2–4 specific RISKS (sequence-of-returns, concentration, currency, liquidity, etc.)
- 2–4 OPPORTUNITIES (tax-shielded room, contribution headroom, rebalancing windows, etc.)
- 3–5 ACTION PLAN steps with short horizon ("this month" | "this quarter" | "this year") and effortHours (1–8)
- A confidenceScore 0–1 reflecting how realistic the assumptions are (1 = very realistic)

Return STRICT JSON matching this schema — no prose outside JSON, no markdown fences:
{
  "verdict": string,
  "headline": string,
  "analysis": string,
  "risks": string[],
  "opportunities": string[],
  "actionPlan": [{ "step": string, "horizon": string, "effortHours": number }],
  "confidenceScore": number
}`;

function aiUnavailable(reason: string, message: string, status: number) {
  return NextResponse.json({ error: "ai_unavailable", reason, message }, { status });
}

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { scenario, baseProjection, scenarioProjection, profile } = body ?? {};

    // Extract summary stats from projection arrays
    const baseFinal = Array.isArray(baseProjection) ? baseProjection[baseProjection.length - 1] : 0;
    const scenFinal = Array.isArray(scenarioProjection) ? scenarioProjection[scenarioProjection.length - 1] : 0;
    const delta = scenFinal - baseFinal;
    const deltaPct = baseFinal > 0 ? ((delta / baseFinal) * 100).toFixed(1) : "0";

    const overrideLines = (scenario?.overrides ?? [])
      .map((o: any) => {
        const parts = [];
        if (o.returnPctOverride !== undefined)
          parts.push(`return ${(o.returnPctOverride * 100).toFixed(1)}%`);
        if (o.monthlyContribOverride !== undefined)
          parts.push(`monthly contrib ฿${o.monthlyContribOverride.toLocaleString()}`);
        return `  ${o.accountName ?? o.accountId}: ${parts.join(", ")}`;
      })
      .join("\n");

    const userPrompt = `User profile:
- Age: ${profile?.age ?? "unknown"}
- Retirement target year: ${profile?.retirementYear ?? "unknown"}
- Risk profile: ${profile?.riskProfile ?? "moderate"}

Scenario name: "${scenario?.name ?? "Custom"}"
Horizon: ${scenario?.horizonYears ?? 20} years
Inflation: ${((scenario?.inflationPct ?? 0.03) * 100).toFixed(1)}%
Tax drag applied: ${scenario?.applyTaxDrag ? "yes" : "no"}
Monte Carlo: ${scenario?.monteCarloEnabled ? "yes" : "no"}

Account overrides:
${overrideLines || "  (none — using base returns)"}

Portfolio summary:
  Base final value:     ฿${Math.round(baseFinal / 1000)}K
  Scenario final value: ฿${Math.round(scenFinal / 1000)}K
  Delta:                ${delta >= 0 ? "+" : ""}฿${Math.round(delta / 1000)}K (${deltaPct}%)

Milestone years:
  Base at year 10: ฿${Math.round((Array.isArray(baseProjection) ? baseProjection[Math.min(10, baseProjection.length - 1)] : 0) / 1000)}K
  Scen at year 10: ฿${Math.round((Array.isArray(scenarioProjection) ? scenarioProjection[Math.min(10, scenarioProjection.length - 1)] : 0) / 1000)}K

Analyze this scenario thoroughly. Return strict JSON only.`;

    const { text } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2500,
      json: true,
      claudeModel: "claude-sonnet-4-6",
    });
    const jsonStr = extractJson(text);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "parse_failed", reason: "model_did_not_return_valid_json", raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...parsed, source: "ai" });
  } catch (e: any) {
    console.error("scenario-analysis error:", e);
    if (e instanceof AiUnavailableError) {
      return aiUnavailable(e.reason, e.message, 503);
    }
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
