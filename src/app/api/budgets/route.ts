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
