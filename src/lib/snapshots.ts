/**
 * VERSION SNAPSHOTS
 * Saves named snapshots of the full app state to localStorage.
 * Users can restore any snapshot at any time.
 */

import { getSession } from "./auth-client";

export interface Snapshot {
  id: string;
  label: string;
  version: string;
  savedAt: string;
  data: string; // JSON of store data
}

export function listSnapshots(): Snapshot[] {
  if (typeof window === "undefined") return [];
  const session = getSession();
  const KEY = session ? `fp-snapshots:${session.userId}` : "fp-snapshots";
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch { return []; }
}

export function saveSnapshot(label: string, version: string, data: string): Snapshot {
  const snap: Snapshot = {
    id: `snap-${Date.now()}`,
    label,
    version,
    savedAt: new Date().toISOString(),
    data,
  };
  if (typeof window === "undefined") return snap;
  const session = getSession();
  const KEY = session ? `fp-snapshots:${session.userId}` : "fp-snapshots";
  const all = listSnapshots();
  all.unshift(snap);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 20))); // keep last 20
  return snap;
}

export function deleteSnapshot(id: string) {
  if (typeof window === "undefined") return;
  const session = getSession();
  const KEY = session ? `fp-snapshots:${session.userId}` : "fp-snapshots";
  const all = listSnapshots().filter(s => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}
