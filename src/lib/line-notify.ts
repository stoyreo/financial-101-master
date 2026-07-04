/**
 * LINE push utility (client side).
 *
 * ⚠️ LINE Notify was DISCONTINUED 2025-03-31. /api/line/notify now pushes via
 * the LINE Messaging API using the server's LINE_CHANNEL_ACCESS_TOKEN and the
 * user's lineUserId (captured at LINE Login). The legacy per-user Notify token
 * helpers below are kept only so the old settings UI keeps compiling — the
 * token is no longer sent anywhere.
 */

const LINE_NOTIFY_TOKEN_KEY = "line_notify_token";

// ── Messaging API push (current) ─────────────────────────────────────────────

/**
 * Push a LINE message to the current user. If lineUserId is omitted, the
 * server resolves it from the Supabase session metadata (LINE Login users).
 */
export async function sendLinePush(message: string, lineUserId?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/line/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, lineUserId }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Legacy Notify-token helpers (deprecated, service discontinued) ───────────

/** @deprecated LINE Notify is discontinued; tokens are unused. */
export function getLINENotifyToken(userId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`${LINE_NOTIFY_TOKEN_KEY}:${userId}`) ?? "";
  } catch { return ""; }
}

/** @deprecated LINE Notify is discontinued; tokens are unused. */
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

/** @deprecated Notify token is ignored; this now pushes via the Messaging API. */
export async function sendLINENotify(_token: string, message: string): Promise<boolean> {
  return sendLinePush(message);
}

// ── Event helpers (called from app logic) ────────────────────────────────────

export async function notifyLINE(_userId: string, message: string): Promise<void> {
  await sendLinePush(message);
}
