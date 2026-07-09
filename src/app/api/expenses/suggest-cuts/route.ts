/**
 * POST /api/expenses/suggest-cuts
 *
 * Body:
 * {
 *   monthlyIncome: number,
 *   monthlySavingsTarget: number,
 *   currentMonthlySavings: number,
 *   billingMonth: "YYYY-MM",
 *   rows: [{ category, budget, actual, gap, isEssential }],
 *   topMerchants: [{ merchant, amount }],   // optional helpful context
 *   recentMonths: [{ ym, total }]           // last 6 months for trend context
 * }
 *
 * Returns:
 * {
 *   summary: string,                  // 2-3 sentence narrative
 *   savingsGap: number,               // how far short of target the user is
 *   suggestions: [
 *     { category, currentMonthly, suggestedReduction, reason, priority,
 *       isEssential, exampleActions: string[] }
 *   ]
 * }
 *
 * Uses Haiku 4.5 for low-latency live recommendations.
 */

import { NextResponse } from "next/server";
import { aiComplete, AiUnavailableError, extractJson, requestedProvider } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You are a Thai personal-finance coach. The user already has a
budget and a savings target. They've shared this month's actual spend per
category. Your job: rank concrete cuts that close the savings gap fastest
WHILE protecting essentials. Return STRICT JSON only — no prose, no fences.

Cut philosophy:
- Always favor discretionary categories first (Travel, Shopping, Entertainment, dining-out Food).
- Essentials (Insurance, Housing, Utilities, Medical, Family, Investment) are off-limits unless
  the actual is materially over budget — then suggest only the OVERAGE, never the whole line.
- Each suggestion should specify a concrete monthly THB number plus a 1-2 sentence reason.
- Stop suggesting once the cumulative savings reach the target.
- Add 2-3 example actions per suggestion (e.g., "limit Grab rides to 3/week", "cancel Apple TV+", "swap Sushiro dinners for home cooking 2x/wk").`;

const SCHEMA = `{
  "summary": string,
  "savingsGap": number,
  "suggestions": [{
    "category": string,
    "currentMonthly": number,
    "suggestedReduction": number,
    "reason": string,
    "priority": "high" | "medium" | "low",
    "isEssential": boolean,
    "exampleActions": [string]
  }]
}`;

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const {
      monthlyIncome = 0,
      monthlySavingsTarget = 0,
      currentMonthlySavings = 0,
      billingMonth,
      rows = [],
      topMerchants = [],
      recentMonths = [],
    } = body ?? {};

    const userPrompt = `Billing month: ${billingMonth}
Monthly net income: ฿${monthlyIncome.toLocaleString()}
Monthly savings target: ฿${monthlySavingsTarget.toLocaleString()}
Current monthly savings (income − total actual spend): ฿${currentMonthlySavings.toLocaleString()}
Savings gap: ฿${Math.max(0, monthlySavingsTarget - currentMonthlySavings).toLocaleString()}

Per-category budget vs actual (THB/month):
${rows.map((r: any) =>
  `- ${r.category}${r.isEssential ? " (ESSENTIAL)" : ""}: budget ${Math.round(r.budget).toLocaleString()}, actual ${Math.round(r.actual).toLocaleString()}, gap ${Math.round(r.gap).toLocaleString()}`
).join("\n")}

Top merchants this month:
${topMerchants.slice(0, 10).map((m: any) => `- ${m.merchant}: ฿${Math.round(m.amount).toLocaleString()}`).join("\n")}

Recent monthly totals (oldest → newest):
${recentMonths.map((m: any) => `- ${m.ym}: ฿${Math.round(m.total).toLocaleString()}`).join("\n")}

Return JSON exactly matching this schema:
${SCHEMA}`;

    const { text, source } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
      json: true,
      claudeModel: "claude-haiku-4-5-20251001",
    }, requestedProvider(req));
    const jsonStr = extractJson(text);

    let parsed: any;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      return NextResponse.json(
        { error: "parse_failed", reason: "model_did_not_return_valid_json", raw: text, message: "AI returned an unparseable response. Try Local Scan." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...parsed, source: "ai", provider: source });
  } catch (e: any) {
    console.error("suggest-cuts error:", e);
    if (e instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: e.reason, message: `${e.message} Use Local Scan instead.` },
        { status: 503 },
      );
    }
    const raw = String(e?.message ?? "");
    // Anthropic credit / billing exhaustion → 402
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "insufficient_credits", message: "Anthropic credits exhausted. Use Local Scan instead." },
        { status: 402 },
      );
    }
    // Auth issues → 401
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "auth_failed", message: "Anthropic auth failed. Use Local Scan instead." },
        { status: 401 },
      );
    }
    // Rate limit → 429
    if (/rate limit|429/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "rate_limited", message: "Anthropic rate-limited. Try again or use Local Scan." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "ai_unavailable", reason: "unknown", message: raw || "AI request failed. Use Local Scan instead." },
      { status: 500 },
    );
  }
}
