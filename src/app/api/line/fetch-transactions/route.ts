/**
 * POST /api/line/fetch-transactions
 *
 * Server-side proxy that fetches live expense data from the LINE Expense
 * Tracker backend and maps it into Financial 101 Transaction objects.
 *
 * The LINE backend requires a LINE UID (e.g. "U1a2b3c...") to scope results
 * to a single user. We trust the LINE category as-is (no re-categorization).
 *
 * dedupeKey = "line-<expense_id>" — deterministic, so re-syncing is a no-op
 * for rows already in the store.
 */

import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { toMerchantKey } from "@/lib/categorize";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const LINE_API_BASE = "https://expense-tracker-api-weld.vercel.app";
const FETCH_LIMIT = 500;

/** Shape returned by GET /api/expenses on the LINE backend. */
interface ExpenseOut {
  id: number;
  amount: number;
  currency: string;
  category: { id: number; name: string };
  merchant: { id: number; name: string } | null;
  note: string | null;
  source: string;
  occurred_at: string;  // ISO 8601
  created_at: string;
}

function ymKey(iso: string): string {
  return iso.slice(0, 7);
}

function toIsoDate(iso: string): string {
  // occurred_at may be "2026-04-22T10:30:00" or "2026-04-22T10:30:00+07:00"
  return iso.slice(0, 10);
}

function mapExpense(e: ExpenseOut, activeAccountId: string): Transaction {
  const date = toIsoDate(e.occurred_at);
  const billingMonth = ymKey(date);
  const description = e.merchant?.name ?? e.note ?? `LINE expense ${e.id}`;
  const merchantKey = toMerchantKey(description);

  return {
    accountId: activeAccountId,
    id: uuid(),
    postDate: date,
    transDate: date,
    billingMonth,
    description: description.slice(0, 100),
    merchantKey,
    amount: Math.abs(e.amount),
    currency: (e.currency?.toUpperCase() === "THB" ? "THB" : "THB") as "THB",
    fxAmount: undefined,
    fxCurrency: undefined,
    category: e.category.name,
    source: "line",
    cardLast4: undefined,
    statementImportId: undefined,
    confidence: 1.0,
    isCredit: false,
    notes: e.note ?? undefined,
    dedupeKey: `line-${e.id}`,
  };
}

export async function POST(req: Request) {
  try {
    const { lineUserId, activeAccountId } = (await req.json()) as {
      lineUserId?: string;
      activeAccountId?: string;
    };

    if (!lineUserId?.trim()) {
      return NextResponse.json(
        { error: "line_user_id_required", message: "lineUserId is required." },
        { status: 400 }
      );
    }
    if (!activeAccountId?.trim()) {
      return NextResponse.json(
        { error: "active_account_id_required", message: "activeAccountId is required." },
        { status: 400 }
      );
    }

    const url = `${LINE_API_BASE}/api/expenses?line_user_id=${encodeURIComponent(lineUserId.trim())}&limit=${FETCH_LIMIT}`;

    let upstream: Response;
    try {
      upstream = await fetch(url, { cache: "no-store" });
    } catch (err: any) {
      return NextResponse.json(
        { error: "line_api_unreachable", message: String(err?.message ?? err) },
        { status: 502 }
      );
    }

    if (!upstream.ok) {
      const body = await upstream.text();
      return NextResponse.json(
        { error: "line_api_error", message: body, status: upstream.status },
        { status: 502 }
      );
    }

    const expenses: ExpenseOut[] = await upstream.json();

    if (!Array.isArray(expenses)) {
      return NextResponse.json(
        { error: "unexpected_response", message: "LINE API did not return an array." },
        { status: 502 }
      );
    }

    const transactions: Transaction[] = expenses.map(e =>
      mapExpense(e, activeAccountId.trim())
    );

    return NextResponse.json({ transactions, total: transactions.length });
  } catch (err: any) {
    console.error("line fetch-transactions error:", err);
    return NextResponse.json(
      { error: err?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}
