/**
 * POST /api/categorize/suggest
 *
 * AI-powered category suggestion for transactions that the deterministic
 * merchant-rule matcher in src/lib/categorize.ts couldn't confidently place
 * (i.e. anything left as "Other" / low-confidence). Uses Claude Haiku to read
 * the raw merchant description (Thai/English bank statement text) and pick
 * the single best BUDGET_CATEGORIES match.
 *
 * This is a SUGGESTION endpoint only — it does not write to any store. The
 * caller (client-side Zustand action) decides whether to apply the result
 * and whether to learn a new merchant rule from it.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { suggestCategoriesAI, type AiCategorizeItem } from "@/lib/ai-categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS = 200;

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { items } = (await req.json()) as { items: AiCategorizeItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "no_items" }, { status: 400 });
    }

    const trimmed = items.slice(0, MAX_ITEMS).filter((it) => it && it.merchantKey);
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "no_items" }, { status: 400 });
    }

    const suggestions = await suggestCategoriesAI(trimmed);
    return NextResponse.json({ suggestions });
  } catch (e: any) {
    console.error("categorize suggest error:", e);
    return NextResponse.json(
      { error: e?.message ?? "suggest_failed" },
      { status: 500 },
    );
  }
}
