/**
 * VERSION LOG TRACKING
 * ────────────────────
 * Tracks version updates and logs them in localStorage with timestamps
 */

import { getSession } from "./auth-client";

export interface VersionLog {
  version: string;
  timestamp: string;
  changes: string[];
  notified: boolean;
}

function getStorageKey(): string {
  if (typeof window === "undefined") return "financial-planner-version-logs";
  const session = getSession();
  return session ? `financial-planner-version-logs:${session.userId}` : "financial-planner-version-logs";
}

/**
 * Get all recorded version logs
 */
export function getVersionLogs(): VersionLog[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(getStorageKey());
  return stored ? JSON.parse(stored) : [];
}

/**
 * Register a new version when app loads
 * Returns true if this is a new version (hadn't been logged before)
 */
export function registerVersionLog(
  version: string,
  changes: string[]
): boolean {
  if (typeof window === "undefined") return false;

  const logs = getVersionLogs();
  const existingLog = logs.find((l) => l.version === version);

  // Already logged this version
  if (existingLog) return false;

  // New version — log it
  const newLog: VersionLog = {
    version,
    timestamp: new Date().toISOString(),
    changes,
    notified: false,
  };

  logs.unshift(newLog); // Add to front (most recent first)
  localStorage.setItem(getStorageKey(), JSON.stringify(logs.slice(0, 50))); // Keep last 50

  return true;
}

/**
 * Mark a version as notified (user has seen the popup)
 */
export function markVersionNotified(version: string): void {
  if (typeof window === "undefined") return;
  const logs = getVersionLogs();
  const log = logs.find((l) => l.version === version);
  if (log) {
    log.notified = true;
    localStorage.setItem(getStorageKey(), JSON.stringify(logs));
  }
}

/**
 * Get the most recent unnotified version
 */
export function getUnnotifiedVersion(): VersionLog | null {
  const logs = getVersionLogs();
  return logs.find((l) => !l.notified) || null;
}

/**
 * Get all unnotified versions
 */
export function getUnnotifiedVersions(): VersionLog[] {
  return getVersionLogs().filter((l) => !l.notified);
}

/**
 * Clear all version logs (for testing)
 */
export function clearVersionLogs(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey());
}
