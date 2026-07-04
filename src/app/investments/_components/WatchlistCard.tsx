"use client";

/**
 * WatchlistCard — pinned SHORT-TERM picks from the AI Short-Term Radar.
 *
 * Deliberately no free-text ticker input: the only way in is the pin button
 * on a radar pick card, so the list stays a focused 7–14 day monitoring set,
 * each item carrying the catalyst/conviction context from when it was pinned.
 *
 * "Refresh prices" is ON-DEMAND: one click → one call to
 * /api/investments/watchlist-quotes (free quote proxy, no AI tokens).
 * Quotes are cached on the items (sessionStorage, per-user).
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import {
  Pin, PinOff, RefreshCw, Loader2, TrendingUp, TrendingDown, CalendarClock, AlertCircle, BellRing, BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadWatchlist, unpinTicker, saveWatchlist, syncWatchlistFromServer, WATCHLIST_EVENT, type WatchItem,
} from "./watchlist";
import { useStore } from "@/lib/store";

type QuoteResp = {
  quotes: {
    ticker: string;
    price: number;
    prevClose: number | null;
    changePct: number | null;
    currency: string;
    marketState?: string;
    quotedAt: string;
    source: string;
  }[];
  errors: { ticker: string; reason: string }[];
};

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function WatchlistCard({ userId }: { userId: string }) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsMsg, setAlertsMsg] = useState<string | null>(null);

  // Load + stay in sync with pins made from the radar card.
  // On mount, hydrate from Supabase (server wins) so pins survive tab close.
  useEffect(() => {
    const sync = () => setItems(loadWatchlist(userId));
    sync();
    syncWatchlistFromServer(userId); // fires WATCHLIST_EVENT when done
    window.addEventListener(WATCHLIST_EVENT, sync);
    // Also load current alert setting.
    fetch("/api/investments/radar-store")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data?.alerts) setAlertsEnabled(!!j.data.alerts.enabled); })
      .catch(() => {});
    return () => window.removeEventListener(WATCHLIST_EVENT, sync);
  }, [userId]);

  // Opt-in daily LINE alerts (band breach / catalyst countdown), via cron.
  // Pushes go through the LINE Messaging API to the user's lineUserId
  // (captured at LINE Login) — LINE Notify was discontinued 2025-03-31.
  const lineUserId = useStore((s) => s.lineUserId);
  const toggleAlerts = useCallback(async () => {
    setAlertsBusy(true);
    setAlertsMsg(null);
    try {
      const next = !alertsEnabled;
      if (next && !lineUserId) {
        setAlertsMsg("Sign in with LINE first (or link LINE in your profile) so alerts know where to go — then add the bot as a friend.");
        return;
      }
      const res = await fetch("/api/investments/radar-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: next ? { enabled: true, lineUserId } : { enabled: false } }),
      });
      if (res.ok) {
        setAlertsEnabled(next);
        setAlertsMsg(next
          ? "Daily LINE alerts on — make sure you've added the app's LINE bot as a friend, or pushes can't reach you."
          : "LINE alerts off; stored LINE id removed.");
      } else {
        setAlertsMsg("Could not update alert settings. Try again.");
      }
    } catch {
      setAlertsMsg("Network error — could not update alert settings.");
    } finally {
      setAlertsBusy(false);
    }
  }, [alertsEnabled, lineUserId]);

  const refresh = useCallback(async () => {
    const current = loadWatchlist(userId);
    if (current.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments/watchlist-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: current.map((i) => i.ticker) }),
      });
      const data: QuoteResp & { message?: string } = await res.json();
      if (!res.ok) {
        setError(data?.message || "Could not fetch latest prices. Try again.");
        return;
      }
      const byTicker = new Map(data.quotes.map((q) => [q.ticker, q]));
      const updated = current.map((it) => {
        const q = byTicker.get(it.ticker);
        return q
          ? { ...it, price: q.price, prevClose: q.prevClose ?? undefined, changePct: q.changePct ?? undefined, currency: q.currency, quotedAt: q.quotedAt }
          : it;
      });
      saveWatchlist(userId, updated); // fires WATCHLIST_EVENT → setItems via listener
      if (data.errors?.length) {
        setError(`No quote for: ${data.errors.map((e) => e.ticker).join(", ")}`);
      }
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    } catch {
      setError("Network error — could not reach the quote endpoint.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-violet-500" />
            Short-Term Watchlist
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {items.length} pinned
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggleAlerts} disabled={alertsBusy}
              title={alertsEnabled ? "Disable daily LINE alerts" : "Enable daily LINE alerts (band breach + catalyst countdown)"}>
              {alertsBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : alertsEnabled ? <BellRing className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                : <BellOff className="h-3.5 w-3.5 mr-1.5" />}
              {alertsEnabled ? "LINE alerts on" : "LINE alerts off"}
            </Button>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading || items.length === 0}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              {loading ? "Fetching…" : "Refresh prices"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Pins come from the AI Short-Term Radar only — your 7–14 day monitoring set, synced to your account. With LINE alerts on, a daily check pings you when a pick crosses its AI band or a catalyst is ≤2 days out.
        </p>
        {alertsMsg && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{alertsMsg}</p>}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing pinned yet. Run a scan in the <span className="font-semibold text-foreground">AI Short-Term Radar</span> above and hit the <Pin className="inline h-3.5 w-3.5 -mt-0.5" /> on any pick to monitor it here.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => {
              const up = (it.changePct ?? 0) >= 0;
              const long = it.direction !== "avoid";
              return (
                <div key={it.ticker} className="rounded-xl border border-border bg-card p-3 relative group">
                  <button
                    onClick={() => unpinTicker(userId, it.ticker)}
                    title={`Unpin ${it.ticker}`}
                    className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{it.ticker}</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      long ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                           : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                    )}>
                      {long ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {long ? "LONG" : "AVOID"}
                    </span>
                    {typeof it.confidence === "number" && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">conv. {Math.round(it.confidence)}</span>
                    )}
                  </div>
                  {it.company && <div className="text-[11px] text-muted-foreground truncate">{it.company}</div>}

                  <div className="mt-2 flex items-baseline gap-2">
                    {it.price !== undefined ? (
                      <>
                        <span className={cn("text-lg font-bold tabular-nums transition-colors duration-500", flash && "text-violet-500")}>
                          ${it.price.toFixed(2)}
                        </span>
                        {it.changePct !== undefined && (
                          <span className={cn("text-xs font-semibold tabular-nums", up ? "text-emerald-500" : "text-red-500")}>
                            {up ? "▲" : "▼"} {Math.abs(it.changePct).toFixed(2)}%
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No quote yet — hit Refresh</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{it.quotedAt ? `Quoted ${timeAgo(it.quotedAt)}` : `Pinned ${timeAgo(it.pinnedAt)}`}</span>
                  </div>
                  {it.catalyst && (
                    <div className="mt-1.5 flex items-start gap-1 text-[10.5px] text-blue-600 dark:text-blue-400">
                      <CalendarClock className="h-3 w-3 shrink-0 mt-px" />
                      <span className="line-clamp-2">{it.catalyst}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
