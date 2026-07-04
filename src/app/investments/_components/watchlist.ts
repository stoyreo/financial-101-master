/**
 * Pinned US-stock watchlist — sessionStorage, keyed by userId.
 * Per CLAUDE.md: NEVER localStorage (multi-user data isolation).
 *
 * Components stay in sync via a window CustomEvent — the radar's pin buttons
 * and the WatchlistCard both listen for WATCHLIST_EVENT.
 */

export type WatchItem = {
  ticker: string;         // uppercase, e.g. "NVDA"
  company?: string;
  // Short-term pick context captured at pin time (pins only come from the
  // AI Short-Term Radar — there is deliberately no free-text add).
  catalyst?: string;
  catalystDate?: string;  // ISO date of the catalyst, used by the alert cron
  direction?: string;     // "long" | "avoid"
  confidence?: number;    // 0-100 at pin time
  expectedLowPct?: number;   // AI band at pin time — alert cron triggers
  expectedHighPct?: number;  // when price crosses entry*(1+low/high %)
  entryPrice?: number;    // reference price at pin time (backfilled by refresh/cron)
  pinnedAt: string;       // ISO date
  // last fetched quote (filled by the Refresh button, cached with the item)
  price?: number;
  prevClose?: number;
  changePct?: number;
  currency?: string;
  quotedAt?: string;      // ISO timestamp of the fetch
};

export const WATCHLIST_EVENT = "f101-watchlist-changed";
export const MAX_WATCHLIST = 12;

function storageKey(userId: string): string {
  return `f101:investments:watchlist:${userId}`;
}

export function loadWatchlist(userId: string): WatchItem[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

export function saveWatchlist(userId: string, items: WatchItem[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, MAX_WATCHLIST)));
    window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
  } catch {
    // sessionStorage might be full — silently ignore
  }
  pushWatchlistToServer(items); // fire-and-forget Supabase sync
}

/* ── Supabase sync (via /api/investments/radar-store) ─────────────────────
 * sessionStorage is the fast local cache; the server blob is the source of
 * truth so pins survive tab close and follow the user across devices. */

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function pushWatchlistToServer(items: WatchItem[]): void {
  // Debounce rapid pin/unpin clicks into one write.
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/investments/radar-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: items.slice(0, MAX_WATCHLIST) }),
    }).catch(() => { /* offline — sessionStorage still has it */ });
  }, 600);
}

/** Hydrate from Supabase (server wins). Call once per mount. */
export async function syncWatchlistFromServer(userId: string): Promise<WatchItem[]> {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const res = await fetch("/api/investments/radar-store");
    if (!res.ok) return loadWatchlist(userId);
    const json = await res.json();
    const items: WatchItem[] = Array.isArray(json?.data?.watchlist) ? json.data.watchlist : [];
    sessionStorage.setItem(storageKey(userId), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
    return items;
  } catch {
    return loadWatchlist(userId);
  }
}

export function isPinned(userId: string, ticker: string): boolean {
  return loadWatchlist(userId).some((w) => w.ticker === ticker.toUpperCase());
}

/** Returns false if the list is full or the ticker is already pinned. */
export function pinTicker(
  userId: string,
  ticker: string,
  meta?: Partial<Omit<WatchItem, "ticker" | "pinnedAt">>,
): boolean {
  const t = ticker.toUpperCase().trim();
  if (!t || !/^[A-Z.\-]{1,10}$/.test(t)) return false;
  const items = loadWatchlist(userId);
  if (items.some((w) => w.ticker === t) || items.length >= MAX_WATCHLIST) return false;
  items.push({ ticker: t, ...meta, pinnedAt: new Date().toISOString() });
  saveWatchlist(userId, items);
  return true;
}

export function unpinTicker(userId: string, ticker: string): void {
  const t = ticker.toUpperCase();
  saveWatchlist(userId, loadWatchlist(userId).filter((w) => w.ticker !== t));
}
