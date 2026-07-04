/**
 * POST /api/investments/preset-vectors
 *
 * Sonnet 4.6 — generates Bull/Bear/Recession return-shift vectors from current
 * macro context. The client caches the result for 24 hours via sessionStorage.
 *
 * Returns: { asOf, presets: { bull, bear, recession }, rationale }
 */

import { NextResponse } from "next/server";
import { aiComplete, extractJson } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Generic Thai market reference figures, used to calibrate shifts per
// AccountType. These are deliberately asset-class-level, NOT anchored to any
// single specific fund (e.g. PVDMPFEQ) — different users hold different
// PVD/RMF funds, so the shift vectors must stay fund-agnostic.
const SYSTEM = `You are a Thai investment strategist. Given today's date and global/Thai
macro context, generate realistic return-shift vectors for Bull, Bear, and Recession scenarios.

Shifts represent the DELTA added to each account type's BASE expected return (e.g., +0.03
means "add 3% to whatever the user set"). Use Thai market history as anchor:
  - SET total return: ~6–8% long-run (PVD accounts are commonly invested in SET-index or
    similar equity-tracking policies — calibrate shifts to general Thai equity-fund behavior,
    not any single fund, since different users hold different PVD/RMF funds)
  - Thai bonds/savings: ~1–2%
  - RMF/SSF equity funds: ~5–10%
  - Crypto: highly volatile

Return STRICT JSON — no prose, no fences:
{
  "asOf": "YYYY-MM-DD",
  "presets": {
    "bull":      { "label": "Bull",      "shifts": { "PVD": number, "RMF": number, "SSF": number, "SSO": number, "brokerage": number, "savings": number, "crypto": number, "other": number } },
    "bear":      { "label": "Bear",      "shifts": { "PVD": number, "RMF": number, "SSF": number, "SSO": number, "brokerage": number, "savings": number, "crypto": number, "other": number } },
    "recession": { "label": "Recession", "shifts": { "PVD": number, "RMF": number, "SSF": number, "SSO": number, "brokerage": number, "savings": number, "crypto": number, "other": number } }
  },
  "rationale": "string (1 paragraph, max 60 words)"
}`;

function aiUnavailable(reason: string, message: string, status: number) {
  return NextResponse.json({ error: "ai_unavailable", reason, message }, { status });
}

/** Hardcoded fallback in case AI is unavailable */
const FALLBACK_VECTORS = {
  asOf: new Date().toISOString().slice(0, 10),
  presets: {
    bull:      { label: "Bull",      shifts: { PVD: 0.02, RMF: 0.04, SSF: 0.04, SSO: 0.01, brokerage: 0.05, savings: 0.005, crypto: 0.20, other: 0.02 } },
    bear:      { label: "Bear",      shifts: { PVD: -0.02, RMF: -0.03, SSF: -0.03, SSO: -0.01, brokerage: -0.05, savings: 0.0, crypto: -0.40, other: -0.02 } },
    recession: { label: "Recession", shifts: { PVD: -0.04, RMF: -0.06, SSF: -0.06, SSO: -0.02, brokerage: -0.10, savings: -0.005, crypto: -0.55, other: -0.05 } },
  },
  rationale: "Fallback vectors based on Thai market historical ranges. Bull: strong equity cycle. Bear: mild correction. Recession: severe drawdown across risk assets.",
  source: "fallback",
};

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const today = new Date().toISOString().slice(0, 10);

    const userPrompt = `Today is ${today}. Generate Bull/Bear/Recession return-shift vectors for a Thai retail investor
holding PVD, RMF/SSF equity funds, brokerage accounts, savings, and crypto.
Consider current global interest rate environment, Thai baht dynamics, SET valuation, and global equity cycle.
Return strict JSON only.`;

    const { text } = await aiComplete({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 600,
      json: true,
      claudeModel: "claude-sonnet-4-6",
    });
    const jsonStr = extractJson(text);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ ...FALLBACK_VECTORS, source: "fallback_parse_error" });
    }

    return NextResponse.json({ ...parsed, source: "ai" });
  } catch (e: any) {
    console.error("preset-vectors error:", e);
    // Always return fallback on error — this is a non-critical enhancement
    return NextResponse.json({ ...FALLBACK_VECTORS, source: "fallback_error" });
  }
}
