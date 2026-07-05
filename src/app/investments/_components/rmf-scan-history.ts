/**
 * RMF AI-scan history — a traceable log of each "top 5 RMF (AI)" scan the user
 * runs in the DCA/RMF simulator. sessionStorage, keyed by userId.
 * Per CLAUDE.md: NEVER localStorage (multi-user data isolation).
 *
 * Each entry is a full snapshot of a scan result so the user can reopen a past
 * scan and reload its ranking into the card, not just see a timestamp.
 */

// Kept structurally in sync with AIFund in DCASimulatorCard.tsx. Duplicated as
// a plain shape here to avoid a component→module import cycle.
export type ScanFund = {
  rank: number;
  code: string;
  name: string;
  manager: string;
  yoyReturnPct: number;
  riskLevel: number;
  note: string;
  // riskBreakdown is intentionally omitted from the persisted snapshot to keep
  // sessionStorage small; the reloaded ranking still shows rank/return/risk.
};

export type RMFScan = {
  id: string;
  scannedAt: string;          // ISO timestamp of when the scan ran
  asOf: string | null;        // model's "ranked as of" label
  returnPeriod: string | null;
  caveat: string | null;      // freshness caveat shown with the result
  funds: ScanFund[];
  sources: { title: string; url: string }[];
};

export const RMF_SCAN_EVENT = "f101-rmf-scan-changed";
export const MAX_SCANS = 10;

function storageKey(userId: string): string {
  return `f101:investments:rmf-scans:${userId}`;
}

export function loadRMFScans(userId: string): RMFScan[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

function persist(userId: string, scans: RMFScan[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(scans.slice(0, MAX_SCANS)));
    window.dispatchEvent(new CustomEvent(RMF_SCAN_EVENT));
  } catch {
    // sessionStorage might be full — silently ignore
  }
}

/** Prepend a new scan snapshot; most-recent-first, capped at MAX_SCANS. */
export function addRMFScan(userId: string, scan: RMFScan): RMFScan[] {
  const updated = [scan, ...loadRMFScans(userId)].slice(0, MAX_SCANS);
  persist(userId, updated);
  return updated;
}

export function removeRMFScan(userId: string, id: string): RMFScan[] {
  const updated = loadRMFScans(userId).filter(s => s.id !== id);
  persist(userId, updated);
  return updated;
}

export function clearRMFScans(userId: string): void {
  persist(userId, []);
}
