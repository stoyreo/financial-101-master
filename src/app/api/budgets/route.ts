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

function getFallbackBudgets() {
  return {
    budgets: [
      { category: 'Food',          monthly_budget: 12000 },
      { category: 'Family',        monthly_budget: 10000 },
      { category: 'Travel',        monthly_budget: 8333  },
      { category: 'Shopping',      monthly_budget: 8000  },
      { category: 'Transport',     monthly_budget: 6750  },
      { category: 'Housing',       monthly_budget: 5000  },
      { category: 'Utilities',     monthly_budget: 4000  },
      { category: 'Pet',           monthly_budget: 4000  },
      { category: 'Insurance',     monthly_budget: 2500  },
      { category: 'Health',        monthly_budget: 1800  },
      { category: 'Entertainment', monthly_budget: 1500  },
    ],
    source: 'fallback',
    generated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('storage_key', 'fp_data_toy')
      .single();

    if (error || !data?.data) {
      return NextResponse.json(getFallbackBudgets(), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
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
      const base = expense.budgetAmount ?? expense.amount;
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
      { budgets, source: 'financial-101', generated_at: new Date().toISOString() },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    );
  } catch (err) {
    console.error('[/api/budgets] error:', err);
    return NextResponse.json(getFallbackBudgets(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }
}
