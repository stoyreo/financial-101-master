/**
 * POST /api/expenses/ai-match
 *
 * AI-powered upgrade to matchTransactionToItem's keyword-overlap heuristic
 * (src/lib/actuals.ts). The heuristic only catches a transaction when its
 * merchant/description shares a literal token with a budget item's name
 * ("FITNESS FIRST" <-> "Gym & Fitness"). It misses recurring-but-irregular
 * merchants (e.g. a gym that bills under three different trade names),
 * one-off split bills, and mislabeled bank descriptions. This route hands
 * each currently-unmatched transaction to the AI with full context (merchant,
 * description, amount, date, category) and asks it to reason per-transaction
 * about which existing budget item — if any — it actually belongs to.
 *
 * Body:
 * {
 *   transactions: [{ id, description, merchantKey, amount, category, postDate, billingMonth }],
 *   items: [{ id, name, category, isEssential }]
 * }
 *
 * Returns:
 * {
 *   matches: [{ transactionId, matchedItemId: string | null, confidence: "high"|"medium"|"low", reason: string }],
 *   source: "ai",
 *   provider: string
 * }
 *
 * Uses Haiku 4.5 (via the shared ai-provider) for low-latency batched matching.
 */

import { NextResponse } from "next/server";
import { aiComplete, AiUnavailableError, extractJson, requestedProvider } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Hard cap on how many transactions go into a single AI call — keeps the
// prompt (and cost/latency) bounded even on accounts with years of imported
// statements. Caller should pre-sort by amount descending if it wants the
// biggest-impact transactions matched first within this cap.
const MAX_TRANSACTIONS = 150;

const SYSTEM = `You are matching credit-card transactions to a user's existing
personal budget line items. For EACH transaction, decide whether it actually
belongs to one of the candidate budget items in the SAME category, or whether
it's genuinely unbudgeted spend that doesn't match anything yet.

Reason per-transaction, not just by simple keyword overlap. Consider:
- Recurring merchants that bill under slightly different trade names or
  payment-processor descriptors across months (e.g. a gym billing as
  "FITNESS FIRST", "FF BANGKOK", or "VIRTUAL PAY-FITNESS").
- Irregular but plausibly-the-same-subscription merchants (annual vs monthly
  amounts, slight amount drift from FX or promo pricing).
- Split or partial bills that still belong to a recurring budget line.
- Generic/abbreviated bank descriptions that don't share tokens with the
  budget item name but clearly describe the same vendor type.
- Do NOT force a match just because a category matches — if nothing fits,
  return matchedItemId: null.

Return STRICT JSON only — no prose, no markdown fences.`;

const SCHEMA = `{
  "matches": [{
    "transactionId": string,
    "matchedItemId": string | null,
    "confidence": "high" | "medium" | "low",
    "reason": string
  }]
}`;

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const transactions = Array.isArray(body?.transactions) ? body.transactions : [];
    const items = Array.isArray(body?.items) ? body.items : [];

    if (transactions.length === 0) {
      return NextResponse.json({ matches: [], source: "ai", provider: "none" });
    }
    if (items.length === 0) {
      // Nothing to match against — every transaction is trivially unmatched.
      return NextResponse.json({
        matches: transactions.map((t: any) => ({
          transactionId: t.id,
          matchedItemId: null,
          confidence: "high",
          reason: "No active budget items exist to match against.",
        })),
        source: "ai",
        provider: "none",
      });
    }

    const capped = transactions.slice(0, MAX_TRANSACTIONS);

    const itemsByCategory = new Map<string, any[]>();
    for (const it of items) {
      const list = itemsByCategory.get(it.category) ?? [];
      list.push(it);
      itemsByCategory.set(it.category, list);
    }

    const userPrompt = `Candidate budget items, grouped by category (only items in the
SAME category as a transaction are eligible matches for it):
${Array.from(itemsByCategory.entries())
  .map(([cat, list]) =>
    `Category "${cat}":\n${list.map((i: any) => `  - id=${i.id} name="${i.name}"${i.isEssential ? " (essential)" : ""}`).join("\n")}`
  )
  .join("\n")}

Transactions to match (${capped.length}):
${capped
  .map((t: any) =>
    `- id=${t.id} category="${t.category}" amount=${Math.round(t.amount)} date=${t.postDate ?? t.billingMonth ?? ""} desc="${t.description ?? ""}" merchant="${t.merchantKey ?? ""}"`
  )
  .join("\n")}

Return JSON exactly matching this schema, with one entry per transaction id above:
${SCHEMA}`;

    const { text, source } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4000,
      json: true,
      claudeModel: "claude-haiku-4-5-20251001",
    }, requestedProvider(req));
    const jsonStr = extractJson(text);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "parse_failed", reason: "model_did_not_return_valid_json", raw: text, message: "AI returned an unparseable response. Try again." },
        { status: 502 },
      );
    }

    const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
    // Defensive: drop entries that don't reference a real item id, and
    // backfill any transaction the model silently skipped as "no match"
    // rather than letting it disappear and fall back to stale state.
    const validItemIds = new Set(items.map((i: any) => i.id));
    const byTxnId = new Map<string, any>(matches.map((m: any) => [m.transactionId, m]));
    const safeMatches = capped.map((t: any) => {
      const m = byTxnId.get(t.id);
      const matchedItemId = m && validItemIds.has(m.matchedItemId) ? m.matchedItemId : null;
      return {
        transactionId: t.id,
        matchedItemId,
        confidence: m?.confidence ?? "low",
        reason: m?.reason ?? "Model did not return a match for this transaction.",
      };
    });

    return NextResponse.json({ matches: safeMatches, source: "ai", provider: source });
  } catch (e: any) {
    console.error("ai-match error:", e);
    if (e instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: e.reason, message: `${e.message} Keyword matching is still active.` },
        { status: 503 },
      );
    }
    const raw = String(e?.message ?? "");
    if (/credit balance is too low/i.test(raw) || /insufficient_quota/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "insufficient_credits", message: "Anthropic credits exhausted. Keyword matching is still active." },
        { status: 402 },
      );
    }
    if (/invalid x-api-key|authentication/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "auth_failed", message: "Anthropic auth failed. Keyword matching is still active." },
        { status: 401 },
      );
    }
    if (/rate limit|429/i.test(raw)) {
      return NextResponse.json(
        { error: "ai_unavailable", reason: "rate_limited", message: "Anthropic rate-limited. Try again shortly." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "ai_unavailable", reason: "unknown", message: raw || "AI match request failed." },
      { status: 500 },
    );
  }
}
