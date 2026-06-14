/**
 * audit-log.ts
 * Lightweight per-user audit log stored in localStorage (keyed by userId).
 * Logs: login, logout, account_switch, data_import, data_export, data_reset, slip_upload.
 * Max 500 entries per user (oldest trimmed automatically).
 */

export type AuditEventType =
  | "login"
  | "logout"
  | "account_switch"
  | "data_import"
  | "data_export"
  | "data_reset"
  | "slip_upload"
  | "statement_import"
  | "backup_sync"
  | "password_change";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: string;   // ISO
  userId: string;
  detail: string;      // Human-readable summary
  meta?: Record<string, string | number | boolean>;
}

const MAX_ENTRIES = 500;

function storageKey(userId: string): string {
  return `audit_log:${userId}`;
}

function load(userId: string): AuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(userId: string, events: AuditEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = events.slice(-MAX_ENTRIES);
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch { /* quota — ignore */ }
}

export function logAuditEvent(
  userId: string,
  type: AuditEventType,
  detail: string,
  meta?: Record<string, string | number | boolean>,
): void {
  if (!userId) return;
  const events = load(userId);
  events.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: new Date().toISOString(),
    userId,
    detail,
    meta,
  });
  save(userId, events);
}

export function getAuditLog(userId: string): AuditEvent[] {
  return load(userId).reverse(); // newest first
}

export function clearAuditLog(userId: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
}

// ── Event type display helpers ──────────────────────────────────────────────

export const EVENT_LABELS: Record<AuditEventType, string> = {
  login: "Login",
  logout: "Logout",
  account_switch: "Account Switch",
  data_import: "Data Import",
  data_export: "Data Export",
  data_reset: "Data Reset",
  slip_upload: "Slip Upload",
  statement_import: "Statement Import",
  backup_sync: "Backup Sync",
  password_change: "Password Changed",
};

export const EVENT_COLORS: Record<AuditEventType, string> = {
  login: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400",
  logout: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400",
  account_switch: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
  data_import: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
  data_export: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400",
  data_reset: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  slip_upload: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400",
  statement_import: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400",
  backup_sync: "text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400",
  password_change: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
};
