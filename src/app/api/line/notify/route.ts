/**
 * POST /api/line/notify
 *
 * ⚠️ MIGRATED: LINE Notify (notify-api.line.me) was discontinued 2025-03-31.
 * This route now pushes via the LINE Messaging API (src/lib/line-push.ts)
 * using the server-side LINE_CHANNEL_ACCESS_TOKEN.
 *
 * Body: { message: string, lineUserId?: string }
 *   - lineUserId: explicit target (e.g. from the app store after LINE Login)
 *   - if omitted, falls back to the Supabase session's user_metadata
 *     (line_user_id is set there when the user signs in with LINE)
 *   - legacy `token` field is accepted but IGNORED (Notify is dead)
 *
 * The recipient must have added the Messaging API bot as a friend, or LINE
 * rejects the push.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { pushLineMessage, lineChannelConfigured } from "@/lib/line-push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = getSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string; lineUserId?: string };
  const message = body?.message;
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!lineChannelConfigured()) {
    return NextResponse.json(
      {
        error: "line_not_configured",
        detail:
          "LINE Notify was discontinued (2025-03-31). Set LINE_CHANNEL_ACCESS_TOKEN (Messaging API channel token) to enable pushes.",
      },
      { status: 503 },
    );
  }

  const lineUserId =
    (typeof body?.lineUserId === "string" && body.lineUserId) ||
    (session.user?.user_metadata?.line_user_id as string | undefined) ||
    "";

  if (!lineUserId) {
    return NextResponse.json(
      { error: "no_line_user", detail: "No LINE user id — sign in with LINE first, then retry." },
      { status: 400 },
    );
  }

  const result = await pushLineMessage(lineUserId, message);
  if (!result.ok) {
    return NextResponse.json(
      { error: "LINE push error", detail: result.error ?? "unknown" },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
