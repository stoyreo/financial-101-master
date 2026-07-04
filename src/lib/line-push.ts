/**
 * SERVER-ONLY LINE Messaging API push helper.
 *
 * LINE Notify (notify-api.line.me) was DISCONTINUED on 2025-03-31 — pushes
 * now go through the Messaging API instead:
 *
 *   POST https://api.line.me/v2/bot/message/push
 *   Authorization: Bearer LINE_CHANNEL_ACCESS_TOKEN   (server env var)
 *   { to: <lineUserId>, messages: [{ type: "text", text }] }
 *
 * Requirements (one-time, LINE Developers Console):
 *   1. Create a Messaging API channel (can live in the same provider as the
 *      existing LINE Login channel).
 *   2. Issue a long-lived channel access token → set LINE_CHANNEL_ACCESS_TOKEN.
 *   3. Each user must add the bot as a friend to receive pushes.
 *
 * The `to` user ID comes from LINE Login (id_token `sub`) — already captured
 * as `lineUserId` in the app session/store.
 */

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function lineChannelConfigured(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

export async function pushLineMessage(
  lineUserId: string,
  text: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured" };
  if (!lineUserId) return { ok: false, error: "missing lineUserId" };
  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // LINE caps a text message at 5000 chars.
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: detail || `LINE push failed (${res.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
