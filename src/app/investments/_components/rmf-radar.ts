/**
 * RMF Radar — a type-to-add watchlist of Thai RMF funds, tracked from the
 * DCA/RMF simulator. Separate from the US-stock Short-Term Watchlist so fund
 * codes and tickers don't mix. sessionStorage, keyed by userId.
 * Per CLAUDE.md: NEVER localStorage (multi-user data isolation).
 *
 * Components stay in sync via a window CustomEvent (RMF_RADAR_EVENT): the AI
 * scan rows' "add" buttons and the radar list both listen for it.
 */

export type RadarFund = {
  code: string;            // uppercase fund code, e.g. "DAOL-GOLDRMF"
  manager?: string;        // AMC name captured at add time (for broker links)
  name?: string;           // full fund name if known
  yoyReturnPct?: number;   // return at add time (from the scan), if any
  riskLevel?: number;      // 1-8 at add time, if any
  note?: string;
  source: "typed" | "scan"; // how it got onto the radar
  addedAt: string;         // ISO date
};

export const RMF_RADAR_EVENT = "f101-rmf-radar-changed";
export const MAX_RADAR = 20;

// Thai RMF fund codes: letters, digits, and - . typically (e.g. DAOL-GOLDRMF,
// SCBRM4, KFDNMRMF). Kept permissive but bounded.
const CODE_RE = /^[A-Z0-9.\-]{2,20}$/;

function storageKey(userId: string): string {
  return `f101:investments:rmf-radar:${userId}`;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().trim().replace(/\s+/g, "");
}

export function isValidCode(raw: string): boolean {
  return CODE_RE.test(normalizeCode(raw));
}

export function loadRadar(userId: string): RadarFund[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

function persist(userId: string, items: RadarFund[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, MAX_RADAR)));
    window.dispatchEvent(new CustomEvent(RMF_RADAR_EVENT));
  } catch {
    // sessionStorage might be full — silently ignore
  }
}

export function isOnRadar(userId: string, code: string): boolean {
  const c = normalizeCode(code);
  return loadRadar(userId).some(f => f.code === c);
}

/**
 * Add a fund to the radar. Returns { ok, reason }:
 *  - ok:false "invalid"    → code fails the format check
 *  - ok:false "duplicate"  → already on the radar
 *  - ok:false "full"       → radar is at MAX_RADAR
 */
export function addToRadar(
  userId: string,
  code: string,
  meta?: Partial<Omit<RadarFund, "code" | "addedAt" | "source">> & { source?: RadarFund["source"] },
): { ok: boolean; reason?: "invalid" | "duplicate" | "full" } {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return { ok: false, reason: "invalid" };
  const items = loadRadar(userId);
  if (items.some(f => f.code === c)) return { ok: false, reason: "duplicate" };
  if (items.length >= MAX_RADAR) return { ok: false, reason: "full" };
  const { source = "typed", ...rest } = meta ?? {};
  const updated = [{ code: c, ...rest, source, addedAt: new Date().toISOString() }, ...items];
  persist(userId, updated);
  return { ok: true };
}

export function removeFromRadar(userId: string, code: string): RadarFund[] {
  const c = normalizeCode(code);
  const updated = loadRadar(userId).filter(f => f.code !== c);
  persist(userId, updated);
  return updated;
}
