/**
 * AUTO-BACKUP ENGINE
 * Uses the File System Access API (Chrome desktop) to write directly
 * into a user-chosen folder (OneDrive\Financial 101 tOy).
 *
 * - User picks the folder once → handle stored in IndexedDB permanently
 * - Auto-saves every 30 min while app is open
 * - Saves on tab close / visibility change
 * - Keeps last 30 timestamped backups, auto-deletes older ones
 * - Backup filename: financeplan_YYYY-MM-DD_HH-MM.json
 */

import { getSession } from "./auth-client";

const IDB_DB    = "fp_backup_db";
const IDB_STORE = "handles";
const IDB_KEY   = "onedrive_dir";
const MAX_FILES = 30;
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function getBackupStatusKey(): string {
  if (typeof window === "undefined") return "fp_backup_status";
  const session = getSession();
  return session ? `fp_backup_status:${session.userId}` : "fp_backup_status";
}

let _timer: ReturnType<typeof setInterval> | null = null;

// ── IndexedDB helpers ─────────────────────────────────────────────
async function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function saveHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => res(null);
    });
  } catch { return null; }
}

// ── File naming ───────────────────────────────────────────────────
function makeFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `financeplan_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
}

// ── Core backup write ─────────────────────────────────────────────
async function writeBackup(dir: FileSystemDirectoryHandle, data: string): Promise<string> {
  const filename = makeFilename();
  const fh = await dir.getFileHandle(filename, { create: true });
  const w  = await fh.createWritable();
  await w.write(data);
  await w.close();
  return filename;
}

/** Prune oldest files if more than MAX_FILES exist */
async function pruneOldBackups(dir: FileSystemDirectoryHandle) {
  const files: { name: string }[] = [];
  for await (const [name] of (dir as any).entries()) {
    if (name.startsWith("financeplan_") && name.endsWith(".json")) {
      files.push({ name });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const toDelete = files.slice(0, Math.max(0, files.length - MAX_FILES));
  for (const f of toDelete) {
    try { await dir.removeEntry(f.name); } catch { /* ignore */ }
  }
}

// ── Public API ────────────────────────────────────────────────────

export interface BackupStatus {
  configured: boolean;
  lastBackup: string | null;  // ISO timestamp
  lastFile: string | null;
  error: string | null;
}

let _status: BackupStatus = { configured: false, lastBackup: null, lastFile: null, error: null };
const isClient = typeof window !== "undefined";
const _listeners: Array<(s: BackupStatus) => void> = [];

export function onBackupStatus(cb: (s: BackupStatus) => void) {
  _listeners.push(cb);
  cb({ ..._status });
  return () => { const i = _listeners.indexOf(cb); if (i >= 0) _listeners.splice(i, 1); };
}

function emit(patch: Partial<BackupStatus>) {
  _status = { ..._status, ...patch };
  if (isClient) localStorage.setItem(getBackupStatusKey(), JSON.stringify(_status));
  _listeners.forEach(cb => cb({ ..._status }));
}

/** Run one backup cycle */
export async function runBackup(getData: () => string): Promise<boolean> {
  const dir = await loadHandle();
  if (!dir) { emit({ configured: false, error: "No folder selected." }); return false; }
  try {
    // Re-verify permission
    const perm = await (dir as any).requestPermission({ mode: "readwrite" });
    if (perm !== "granted") { emit({ error: "Permission denied for backup folder." }); return false; }
    const filename = await writeBackup(dir, getData());
    await pruneOldBackups(dir);
    emit({ configured: true, lastBackup: new Date().toISOString(), lastFile: filename, error: null });
    return true;
  } catch (e: any) {
    emit({ error: e?.message ?? "Backup failed." });
    return false;
  }
}

/** Let user pick OneDrive folder — called once from Settings UI */
export async function setupBackupFolder(): Promise<boolean> {
  if (!("showDirectoryPicker" in window)) {
    emit({ error: "File System Access API not supported. Use Chrome desktop." });
    return false;
  }
  try {
    const dir = await (window as any).showDirectoryPicker({
      mode: "readwrite",
      startIn: "documents",
      id: "fp_backup",
    });
    await saveHandle(dir);
    emit({ configured: true, error: null });
    return true;
  } catch (e: any) {
    if (e?.name !== "AbortError") emit({ error: "Could not access folder." });
    return false;
  }
}

/** Start auto-backup timer + page-close listener */
export function startAutoBackup(getData: () => string) {
  // Load persisted status
  if (!isClient) return;
  try {
    const raw = localStorage.getItem(getBackupStatusKey());
    if (raw) _status = { ..._status, ...JSON.parse(raw) };
  } catch { /* */ }

  // Check if already configured
  if (!isClient) return;
  loadHandle().then(h => { if (h) emit({ configured: true }); });

  // Auto-backup every 30 min
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => runBackup(getData), INTERVAL_MS);

  // Save on page hide (tab close, switch, reload)
  const onHide = () => { if (document.visibilityState === "hidden") runBackup(getData); };
  document.removeEventListener("visibilitychange", onHide);
  document.addEventListener("visibilitychange", onHide);
}

export function stopAutoBackup() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

export function isBackupSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
