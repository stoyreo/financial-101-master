/**
 * LINE Notify utility
 * Sends a message to the user's LINE Notify token.
 * Tokens are stored per-user in sessionStorage (client) and sent
 * to the server via the /api/line/notify route for the actual POST.
 */

const LINE_NOTIFY_TOKEN_KEY = "line_notify_token";

// ── Client helpers ────────────────────────────────────────────────────────────

export function getLINENotifyToken(userId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`${LINE_NOTIFY_TOKEN_KEY}:${userId}`) ?? "";
  } catch { return ""; }
}

export function setLINENotifyToken(userId: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(`${LINE_NOTIFY_TOKEN_KEY}:${userId}`, token);
    } else {
      localStorage.removeItem(`${LINE_NOTIFY_TOKEN_KEY}:${userId}`);
    }
  } catch { /* ignore */ }
}

export async function sendLINENotify(token: string, message: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("/api/line/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, message }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Event helpers (called from app logic) ────────────────────────────────────

export async function notifyLINE(userId: string, message: string): Promise<void> {
  const token = getLINENotifyToken(userId);
  if (token) await sendLINENotify(token, message);
}
