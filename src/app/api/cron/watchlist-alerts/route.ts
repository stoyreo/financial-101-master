/**
 * GET /api/cron/watchlist-alerts — daily LINE price alerts for pinned picks.
 *
 * Runs via Vercel Cron (see vercel.json) on US trading days after the close.
 * Guarded by CRON_SECRET: Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 *
 * For every user who OPTED IN to alerts (alerts.enabled + lineUserId in their
 * radar blob), this:
 *   1. fetches latest prices for their pinned tickers (free quote proxy)
 *   2. backfills entryPrice on first sight of a pin (no alert that day)
 *   3. triggers on: price crossing the AI's expected high band (target hit),
 *      crossing the low band (stop breach), or a catalyst date ≤2 days away
 *   4. sends ONE LINE Messaging API push per user (LINE Notify is dead —
 *      see src/lib/line-push.ts), and marks each condition as alerted so the
 *      same event never pings twice
 *
 * No AI tokens involved — pure quotes + arithmetic.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchQuote } from "@/lib/quotes";
import { pushLineMessage, lineChannelConfigured } from "@/lib/line-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WatchItem = {
  ticker: string;
  direction?: string;
  catalyst?: string;
  catalystDate?: string;
  expectedLowPct?: number;
  expectedHighPct?: number;
  entryPrice?: number;
  price?: number;
  changePct?: number;
  quotedAt?: string;
  alerted?: { high?: boolean; low?: boolean; catalyst?: boolean };
  [k: string]: any;
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z").getTime();
  if (!Number.isFinite(d)) return null;
  return Math.ceil((d - Date.now()) / 86_400_000);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!lineChannelConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not configured — cannot push alerts" },
      { status: 503 },
    );
  }

  const db = getSupabaseAdmin();
  const { data: rows, error } = await db
    .from("user_data")
    .select("storage_key, data")
    .like("storage_key", "%__radar");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let usersChecked = 0;
  let alertsSent = 0;

  for (const row of rows ?? []) {
    const blob = (row.data as any) ?? {};
    const alerts = blob.alerts;
    const watchlist: WatchItem[] = Array.isArray(blob.watchlist) ? blob.watchlist : [];
    if (!alerts?.enabled || !alerts?.lineUserId || watchlist.length === 0) continue;
    usersChecked++;

    const lines: string[] = [];
    let dirty = false;

    for (const item of watchlist) {
      const q = await fetchQuote(item.ticker);
      if (!q) continue;

      item.price = q.price;
      item.changePct = q.changePct ?? undefined;
      item.quotedAt = q.quotedAt;
      dirty = true;

      // First sight of this pin: set the reference price, don't alert yet.
      if (!item.entryPrice || item.entryPrice <= 0) {
        item.entryPrice = q.price;
        continue;
      }

      item.alerted = item.alerted ?? {};
      const movePct = ((q.price - item.entryPrice) / item.entryPrice) * 100;

      const high = item.expectedHighPct;
      if (typeof high === "number" && !item.alerted.high && movePct >= high) {
        item.alerted.high = true;
        lines.push(`🎯 ${item.ticker} hit the AI target band: $${q.price.toFixed(2)} (${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}% vs entry $${item.entryPrice.toFixed(2)}). Consider taking profit.`);
      }

      const low = item.expectedLowPct;
      if (typeof low === "number" && !item.alerted.low && movePct <= low) {
        item.alerted.low = true;
        lines.push(`🛑 ${item.ticker} breached the AI low band: $${q.price.toFixed(2)} (${movePct.toFixed(1)}% vs entry $${item.entryPrice.toFixed(2)}). Review the position.`);
      }

      const dUntil = daysUntil(item.catalystDate);
      if (dUntil !== null && dUntil >= 0 && dUntil <= 2 && !item.alerted.catalyst) {
        item.alerted.catalyst = true;
        lines.push(`📅 ${item.ticker} catalyst in ${dUntil === 0 ? "TODAY" : `${dUntil} day${dUntil > 1 ? "s" : ""}`}: ${item.catalyst ?? "scheduled event"}.`);
      }
    }

    if (lines.length > 0) {
      const { ok } = await pushLineMessage(alerts.lineUserId, `📡 Short-Term Radar alerts\n${lines.join("\n")}`);
      if (ok) alertsSent++;
    }

    if (dirty) {
      await db
        .from("user_data")
        .upsert(
          { storage_key: row.storage_key, data: { ...blob, watchlist }, updated_at: new Date().toISOString() },
          { onConflict: "storage_key" },
        );
    }
  }

  return NextResponse.json({ ok: true, usersChecked, alertsSent, ranAt: new Date().toISOString() });
}
