/**
 * POST /api/investments/scorecard — grade past radar scans against reality.
 *
 * ON-DEMAND (user clicks "Grade past scans"): reads the user's scan history
 * from the radar blob, and for every scan whose 7–14 day window has matured,
 * fetches actual daily closes (free Yahoo proxy — no AI tokens) and grades
 * each pick:
 *
 *   directionHit — long picks: actual move > 0; avoid picks: actual < 0
 *   bandHit      — actual move landed inside the AI's [low, high] band
 *
 * Grades are cached back onto the scan records so tickers are never
 * re-fetched for already-graded scans.
 *
 * Returns { scans, summary: { gradedPicks, directionHits, bandHits } }.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUserStorageKey } from "@/lib/server-auth";
import { fetchDailyCloses } from "@/lib/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ScanPick = {
  ticker: string;
  direction: string;
  base: number;
  low: number;
  high: number;
  confidence?: number;
  // grading (filled here)
  actualPct?: number;
  directionHit?: boolean;
  bandHit?: boolean;
};

type ScanRecord = {
  id: string;
  asOf: string;          // YYYY-MM-DD
  horizonDays: number;
  picks: ScanPick[];
  gradedAt?: string;
};

/** ~1.45 calendar days per trading day covers weekends + the odd holiday. */
function isMatured(asOf: string, horizonDays: number): boolean {
  const start = new Date(asOf + "T00:00:00Z").getTime();
  if (!Number.isFinite(start)) return false;
  const maturity = start + Math.ceil(horizonDays * 1.45) * 86_400_000;
  return Date.now() >= maturity;
}

export async function POST(_req: NextRequest) {
  const authResult = await getAuthenticatedUserStorageKey();
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }
  const key = `${authResult.storageKey}__radar`;

  try {
    const db = getSupabaseAdmin();
    const { data: row, error } = await db.from("user_data").select("data").eq("storage_key", key).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const blob = ((row?.data as any) ?? {}) as Record<string, any>;
    const scans: ScanRecord[] = Array.isArray(blob.scans) ? blob.scans : [];

    const toGrade = scans.filter((s) => !s.gradedAt && isMatured(s.asOf, s.horizonDays));
    let dirty = false;

    // One closes-fetch per distinct ticker across all maturing scans.
    const tickers = Array.from(new Set(toGrade.flatMap((s) => s.picks.map((p) => p.ticker)))).slice(0, 30);
    const closesByTicker = new Map<string, { date: string; close: number }[]>();
    await Promise.all(
      tickers.map(async (t) => {
        const closes = await fetchDailyCloses(t, "6mo");
        if (closes) closesByTicker.set(t, closes);
      }),
    );

    for (const scan of toGrade) {
      let gradedAny = false;
      for (const pick of scan.picks) {
        const closes = closesByTicker.get(pick.ticker);
        if (!closes) continue;
        // First close ON or AFTER the scan date = entry reference.
        const startIdx = closes.findIndex((c) => c.date >= scan.asOf);
        if (startIdx < 0) continue;
        const endIdx = startIdx + scan.horizonDays; // trading days — closes are trading days
        if (endIdx >= closes.length) continue; // not enough data yet
        const start = closes[startIdx].close;
        const end = closes[endIdx].close;
        if (!(start > 0)) continue;
        const actualPct = ((end - start) / start) * 100;
        pick.actualPct = Math.round(actualPct * 100) / 100;
        pick.directionHit = pick.direction === "avoid" ? actualPct < 0 : actualPct > 0;
        pick.bandHit = actualPct >= pick.low && actualPct <= pick.high;
        gradedAny = true;
      }
      if (gradedAny) {
        scan.gradedAt = new Date().toISOString();
        dirty = true;
      }
    }

    if (dirty) {
      await db
        .from("user_data")
        .upsert({ storage_key: key, data: { ...blob, scans }, updated_at: new Date().toISOString() }, { onConflict: "storage_key" });
    }

    const gradedPicks = scans.flatMap((s) => s.picks.filter((p) => typeof p.actualPct === "number"));
    const summary = {
      totalScans: scans.length,
      gradedScans: scans.filter((s) => s.gradedAt).length,
      pendingScans: scans.filter((s) => !s.gradedAt).length,
      gradedPicks: gradedPicks.length,
      directionHits: gradedPicks.filter((p) => p.directionHit).length,
      bandHits: gradedPicks.filter((p) => p.bandHit).length,
    };

    return NextResponse.json({ ok: true, scans, summary });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
