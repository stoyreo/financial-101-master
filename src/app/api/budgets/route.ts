import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment',
  'Health', 'Pet', 'Family', 'Housing', 'Insurance', 'Travel', 'Work', 'Other',
];

function toMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case 'monthly':   return amount;
    case 'yearly':    return Math.round((amount / 12) * 100) / 100;
    case 'quarterly': return Math.round((amount / 3)  * 100) / 100;
    default:          return 0;
  }
}

/**
 * GET /api/budgets?key=<storageKey>
 *
 * DUAL-CALLER DESIGN — do not add hard Supabase session auth here.
 *
 * Caller 1 — Cloudflare Workers LINE bot (expense-tracker):
 *   Runs server-side with no browser/Supabase session. It authenticates by
 *   supplying the user's storageKey (a UUID-derived token) as the `key` query
 *   param. The storageKey is:
 *     • Generated from the user's Supabase UUID (not guessable).
 *     • Stored exclusively in the LINE bot's KV — never exposed client-side.
 *   This is intentional and acceptable: the key is effectively a bearer token
 *   scoped to read-only budget data for one user. Return 404 for unknown keys.
 *
 * Caller 2 — Browser clients:
 *   May call this endpoint directly. They also supply the storageKey, which they
 *   obtain from their authenticated session. Because the key is UUID-derived,
 *   an unauthenticated caller cannot enumerate other users' data.
 *
 * Rate limiting:
 *   TODO: Add rate limiting at the edge (Vercel middleware or Cloudflare WAF)
 *   to prevent brute-force enumeration of storageKeys. A burst limit of ~60 req/min
 *   per IP is recommended. Do NOT add it here in the route handler — it belongs
 *   at the infrastructure layer so it applies before the DB is hit.
 *
 * DO NOT add a mandatory Supabase session check — that would break the LINE bot
 * caller, which has no browser session and relies on the storageKey token pattern.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storageKey = searchParams.get('key');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  } as const;

  // ── Bug 1 fix ──────────────────────────────────────────────
  // No key supplied → this caller (LINE user / expense tracker)
  // has not been linked to a Financial 101 account.
  // Return an explicit empty payload so the expense tracker bot
  // knows NOT to display any budget, rather than falling through
  // to the admin user's data.
  if (!storageKey) {
    return NextResponse.json(
      {
        budgets: [],
        source: 'no_account',
        message: 'No storage key provided. Link your LINE account to Financial 101 first.',
      },
      { headers: corsHeaders }
    );
  }
  // ────────────────────────────────────────────────────────────

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('storage_key', storageKey)
      .single();

    // Key not found in DB → also "no account" (not admin fallback)
    if (error || !data?.data) {
      return NextResponse.json(
        {
          budgets: [],
          source: 'not_found',
          message: 'No Financial 101 data found for this storage key.',
        },
        { status: 404, headers: corsHeaders }
      );
    }

    const plan = data.data as {
      expenses?: Array<{
        category: string;
        budgetAmount?: number | null;
        amount: number;
        frequency: string;
        isActive: boolean;
      }>;
    };

    const budgetMap: Record<string, number> = {};
    for (const expense of plan.expenses ?? []) {
      if (!expense.isActive) continue;
      if (!KNOWN_CATEGORIES.includes(expense.category)) continue;
      const base = expense.amount;
      if (!base || base <= 0) continue;
      const monthly = toMonthly(base, expense.frequency);
      if (monthly <= 0) continue;
      budgetMap[expense.category] = (budgetMap[expense.category] ?? 0) + monthly;
    }

    const budgets = Object.entries(budgetMap)
      .map(([category, monthly_budget]) => ({
        category,
        monthly_budget: Math.round(monthly_budget * 100) / 100,
      }))
      .sort((a, b) => b.monthly_budget - a.monthly_budget);

    return NextResponse.json(
      {
        budgets,
        source: 'financial-101',
        generated_at: new Date().toISOString(),
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    );
  } catch (err) {
    console.error('[/api/budgets] error:', err);
    return NextResponse.json(
      { budgets: [], source: 'error', message: 'Server error.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
