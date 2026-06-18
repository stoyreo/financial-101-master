/**
 * AI-POWERED CATEGORY SUGGESTION
 * ──────────────────────────────
 * Second pass of the categorization pipeline (see src/lib/categorize.ts for
 * the deterministic first pass). Used by:
 *   - /api/statements/import — categorize fresh statement rows the rule
 *     matcher left as "Other" before they ever hit the store.
 *   - /api/categorize/suggest — retroactively re-suggest categories for
 *     transactions already sitting in the store as "Other"/low-confidence.
 *
 * Server-only (uses ANTHROPIC_API_KEY). Both routes share this module so the
 * prompt and JSON contract live in exactly one place.
 */

import Anthropic from "@anthropic-ai/sdk";
import { BUDGET_CATEGORIES } from "./categorize";

export interface AiCategorizeItem {
  merchantKey: string;
  description?: string;
}

export interface AiCategorySuggestion {
  merchantKey: string;
  category: string;
  confidence: number;
  rulePattern: string | null;
  reason?: string;
}

const CHUNK_SIZE = 50;
const CATEGORY_LIST = BUDGET_CATEGORIES.join(", ");

const SYSTEM = `You categorize personal-finance transactions from Thai and international bank/credit-card statements.
Allowed categories (use EXACTLY one of these strings, nothing else): ${CATEGORY_LIST}.
Use merchant name patterns, Thai brand names/transliterations, payment-gateway prefixes (2C2P, OMISE, LINEPAY, GRABFOOD, etc.) and general world knowledge of merchants to pick the single best category.
If a description is too generic or genuinely ambiguous to categorize confidently, choose "Other" and give it a low confidence.
For each item, also propose a short reusable "rulePattern": an UPPERCASE substring (max 24 characters) of the merchant text that would safely match the SAME merchant on future statements — set it to null if the text is too generic to safely reuse as a rule (e.g. a one-off invoice number or a string that could match unrelated merchants).
Return STRICT JSON only, no prose, no markdown fences.`;

function buildUserPrompt(items: AiCategorizeItem[]): string {
  const numbered = items.map((it, i) => ({
    i,
    merchantKey: it.merchantKey,
    description: it.description ?? it.merchantKey,
  }));
  return `Categorize each of these ${items.length} transactions.

${JSON.stringify(numbered, null, 0)}

Respond with a JSON array, one object per input item, in the SAME order, each shaped EXACTLY as:
{"i": number, "category": string, "confidence": number (0..1), "rulePattern": string|null, "reason": string}

Output JSON array only.`;
}

async function suggestChunk(
  client: Anthropic,
  items: AiCategorizeItem[]
): Promise<AiCategorySuggestion[]> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserPrompt(items) }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");

  const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("ai_parse_failed");
  }
  if (!Array.isArray(parsed)) throw new Error("ai_bad_shape");

  const validCategories = new Set<string>(BUDGET_CATEGORIES as readonly string[]);

  return parsed.map((p): AiCategorySuggestion => {
    const idx = typeof p.i === "number" ? p.i : -1;
    const item = idx >= 0 && idx < items.length ? items[idx] : undefined;
    const category = validCategories.has(p.category) ? p.category : "Other";
    const confidence = Math.max(0, Math.min(1, Number(p.confidence) || 0));
    const rulePatternRaw = typeof p.rulePattern === "string" ? p.rulePattern.trim() : null;
    const rulePattern = rulePatternRaw ? rulePatternRaw.toUpperCase().slice(0, 24) : null;
    return {
      merchantKey: item?.merchantKey ?? `unknown-${idx}`,
      category,
      confidence,
      rulePattern,
      reason: typeof p.reason === "string" ? p.reason : undefined,
    };
  });
}

/**
 * Suggest categories for a batch of items, chunked to stay within a
 * reasonable single-call token budget. Caller (route handler) owns auth,
 * input size limits, and what to do with the result.
 */
export async function suggestCategoriesAI(
  items: AiCategorizeItem[]
): Promise<AiCategorySuggestion[]> {
  if (items.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const chunks: AiCategorizeItem[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map((chunk) => suggestChunk(client, chunk)));
  return results.flat();
}
