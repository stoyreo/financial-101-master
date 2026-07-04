"use client";

/**
 * ScorecardCard — "was the radar actually right?"
 *
 * Every radar scan is logged server-side; once a scan's 7–14 day window has
 * matured, "Grade past scans" fetches what the stocks ACTUALLY did (free
 * quote proxy, no AI tokens) and shows calibration:
 *
 *   direction hit-rate — did long picks go up / avoid picks go down?
 *   band hit-rate      — did the move land inside the AI's low–high band?
 *
 * This is the trust dial: if the hit-rate hovers near a coin flip, treat the
 * radar as an idea generator, not a signal.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { Target, Loader2, AlertCircle, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

type ScanPick = {
  ticker: string;
  direction: string;
  base: number;
  low: number;
  high: number;
  actualPct?: number;
  directionHit?: boolean;
  bandHit?: boolean;
};

type ScanRecord = { id: string; asOf: string; horizonDays: number; picks: ScanPick[]; gradedAt?: string };

type Summary = {
  totalScans: number;
  gradedScans: number;
  pendingScans: number;
  gradedPicks: number;
  directionHits: number;
  bandHits: number;
};

export function ScorecardCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRecord[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const grade = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments/scorecard", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || "Grading failed. Try again.");
        return;
      }
      setScans(data.scans);
      setSummary(data.summary);
    } catch {
      setError("Network error — could not reach the scorecard endpoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  const dirRate = summary && summary.gradedPicks > 0 ? Math.round((summary.directionHits / summary.gradedPicks) * 100) : null;
  const bandRate = summary && summary.gradedPicks > 0 ? Math.round((summary.bandHits / summary.gradedPicks) * 100) : null;
  const gradedRows = (scans ?? [])
    .filter((s) => s.gradedAt)
    .flatMap((s) => s.picks.filter((p) => typeof p.actualPct === "number").map((p) => ({ ...p, asOf: s.asOf, horizonDays: s.horizonDays })))
    .slice(0, 12);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-500" />
            Radar Scorecard
            {dirRate !== null && (
              <Badge className={cn(
                dirRate >= 60 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : dirRate >= 45 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              )}>
                called {summary!.directionHits} of {summary!.gradedPicks}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={grade} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Target className="h-3.5 w-3.5 mr-1.5" />}
            {loading ? "Grading…" : "Grade past scans"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Compares each matured scan&apos;s predictions with what prices actually did. A direction hit-rate near 50% means coin flip — treat picks as ideas, not signals.
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!summary && !error && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Run scans in the radar above; once a scan&apos;s window matures (~2–3 weeks), grade it here to see how the AI actually performed.
          </div>
        )}

        {summary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Direction hit-rate</div>
                <div className={cn("text-xl font-bold tabular-nums", dirRate !== null && dirRate >= 55 ? "text-emerald-500" : "text-amber-500")}>
                  {dirRate !== null ? `${dirRate}%` : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Band hit-rate</div>
                <div className="text-xl font-bold tabular-nums text-blue-500">{bandRate !== null ? `${bandRate}%` : "—"}</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Graded picks</div>
                <div className="text-xl font-bold tabular-nums">{summary.gradedPicks}</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Maturing</div>
                <div className="text-xl font-bold tabular-nums flex items-center justify-center gap-1">
                  <Hourglass className="h-4 w-4 text-muted-foreground" />{summary.pendingScans}
                </div>
              </div>
            </div>

            {gradedRows.length > 0 && (
              <div className="space-y-1.5">
                {gradedRows.map((r, i) => (
                  <div key={`${r.asOf}-${r.ticker}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.directionHit
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="font-mono font-bold">{r.ticker}</span>
                      <span className="text-muted-foreground">{r.direction === "avoid" ? "avoid" : "long"} · {r.asOf} · {r.horizonDays}d</span>
                    </div>
                    <div className="tabular-nums text-right shrink-0">
                      <span className="text-muted-foreground">pred {r.base >= 0 ? "+" : ""}{r.base.toFixed(1)}%</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className={cn("font-semibold", (r.actualPct ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(r.actualPct ?? 0) >= 0 ? "+" : ""}{(r.actualPct ?? 0).toFixed(1)}%
                      </span>
                      {r.bandHit && <span className="ml-1.5 text-[10px] text-blue-500">in band</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
