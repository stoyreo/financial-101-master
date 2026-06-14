/**
 * POST /api/line/notify
 * Server-side proxy for LINE Notify API.
 * The user's token is sent from the client; we never store it server-side.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = getSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token, message } = (await req.json()) as { token: string; message: string };

  if (!token || !message) {
    return NextResponse.json({ error: "token and message are required" }, { status: 400 });
  }

  const params = new URLSearchParams({ message });
  const res = await fetch("https://notify-api.line.me/api/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: "LINE Notify API error", detail: body }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
