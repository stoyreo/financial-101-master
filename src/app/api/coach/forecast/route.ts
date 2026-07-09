/**
 * POST /api/coach/forecast
 *
 * Live financial coach. Takes a compact snapshot of the user's forecast +
 * scenario assumptions, returns a quick summary, alerts, and prioritized
 * suggestions to keep the user on track. Uses Claude Haiku 4.5 for
 * sub-second latency (this is the "click button → instant insight" path).
 *
 * Body:
 * {
 *   profile: { age, retirementAge, lifeExpectancy, riskProfile, currency },
 *   scenario: { name, assumptions: ScenarioAssumptions },
 *   snapshot: {
 *     today:   { income, expenses, debtPayments, netCashFlow, debtBalance, investmentBalance, netWorth, savingsRate },
 *     atRetirement?: { year, age, netWorth, expenses },
 *     finalYear:     { year, age, netWorth },
 *     mortgagePayoffYear?: number,
 *     debtFreeYear?: number,
 *     negativeCashFlowMonths: number,
 *     worstDSR: { year, value },
 *   }
 * }
 *
 * Returns:
 * {
 *   summary: string,                   // 2 sentences, plain language
 *   trafficLight: "green" | "amber" | "red",
 *   alerts: [{ severity, title, detail }],
 *   nextActions: [{ title, why, effort: "quick" | "medium" | "deep" }],
 *   confidence: number                  // 0-100
 * }
 */

import { NextResponse } from "next/server";
import { aiComplete, AiUnavailableError, extractJson, requestedProvider } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You are a senior personal-finance coach for a Thai household
using the Financial 101 Master planner. You receive a compact snapshot of
the user's projected forecast under their active scenario.

Your job:
  1. Give a 2-sentence plain-language SUMMARY of where they stand.
  2. Output a TRAFFIC LIGHT: green (on track), amber (drift risk), red (off track).
  3. Surface up to 4 ALERTS — concrete numbers, not platitudes. Severity is
     "info", "warning", or "critical". Skip alerts that don't apply.
  4. Recommend up to 4 NEXT ACTIONS the user can take now to stay on track.
     Tag each with effort: "quick" (today), "medium" (this month), "deep"
     (multi-month). Reference real numbers from the snapshot.
  5. Estimate your overall CONFIDENCE 0-100.

Style: direct, numeric, Thailand-aware (PVD/RMF/SSF, Thai inflation, Bangkok
cost of living). Currency: THB. Round numbers to nearest 1k for readability.
Never invent data not in the snapshot. Return STRICT JSON only — no prose,
no fences.`;

const SCHEMA = `{
  "summary": string,
  "trafficLight": "green" | "amber" | "red",
  "alerts": [{
    "severity": "info" | "warning" | "critical",
    "title": string,
    "detail": string
  }],
  "nextActions": [{
    "title": string,
    "why": string,
    "effort": "quick" | "medium" | "deep"
  }],
  "confidence": number
}`;

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { profile = {}, scenario = {}, snapshot = {} } = body ?? {};

    const userPrompt = `Profile:
- Age: ${profile.age ?? "?"} | Retirement age: ${profile.retirementAge ?? "?"} | Life expectancy: ${profile.lifeExpectancy ?? "?"}
- Risk profile: ${profile.riskProfile ?? "?"} | Currency: ${profile.currency ?? "THB"}

Active scenario: ${scenario.name ?? "Base"}
Assumptions: ${JSON.stringify(scenario.assumptions ?? {})}

Snapshot (THB):
- Today: income ${snapshot.today?.income?.toLocaleString?.() ?? "?"}, expenses ${snapshot.today?.expenses?.toLocaleString?.() ?? "?"}, debt pmts ${snapshot.today?.debtPayments?.toLocaleString?.() ?? "?"}, net cash flow ${snapshot.today?.netCashFlow?.toLocaleString?.() ?? "?"}, debt balance ${snapshot.today?.debtBalance?.toLocaleString?.() ?? "?"}, investments ${snapshot.today?.investmentBalance?.toLocaleString?.() ?? "?"}, net worth ${snapshot.today?.netWorth?.toLocaleString?.() ?? "?"}, savings rate ${((snapshot.today?.savingsRate ?? 0) * 100).toFixed(1)}%
${snapshot.atRetirement ? `- At retirement (${snapshot.atRetirement.year}, age ${snapshot.atRetirement.age}): net worth ${snapshot.atRetirement.netWorth?.toLocaleString?.()}, annual expenses ${snapshot.atRetirement.expenses?.toLocaleString?.()}` : "- Retirement projection unavailable"}
- Final year (${snapshot.finalYear?.year ?? "?"}, age ${snapshot.finalYear?.age ?? "?"}): net worth ${snapshot.finalYear?.netWorth?.toLocaleString?.() ?? "?"}
- Mortgage payoff year: ${snapshot.mortgagePayoffYear ?? "n/a"}
- Debt free year: ${snapshot.debtFreeYear ?? "n/a"}
- Negative cash-flow months in next 5 yrs: ${snapshot.negativeCashFlowMonths ?? 0}
- Worst debt-service ratio: ${snapshot.worstDSR ? `${(snapshot.worstDSR.value * 100).toFixed(1)}% in ${snapshot.worstDSR.year}` : "n/a"}

Return JSON exactly matching:
${SCHEMA}`;

    const { text, source } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1200,
      json: true,
      claudeModel: "claude-haiku-4-5-20251001",
    }, requestedProvider(req));
    const jsonStr = extractJson(text);

    let parsed: any;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      return NextResponse.json(
        { error: "parse_failed", reason: "model_did_not_return_valid_json", raw: text, message: "AI returned an unparseable response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...parsed, source: "ai", provider: source, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    console.error("coach/forecast error:", e);
    if (e instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: e.reason, message: e.message },
        { status: 503 },
      );
    }
    const raw = String(e?.message ?? "");
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "insufficient_credits", message: "Anthropic credits exhausted." },
        { status: 402 },
      );
    }
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "auth_failed", message: "Anthropic auth failed." },
        { status: 401 },
      );
    }
    if (/rate limit|429/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "rate_limited", message: "Anthropic rate-limited. Try again." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "ai_unavailable", reason: "unknown", message: raw || "AI request failed." },
      { status: 500 },
    );
  }
}
