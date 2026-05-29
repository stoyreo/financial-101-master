import { NextRequest, NextResponse } from "next/server";
import { ensureAppUserFromSupabase } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { email, supabaseUserId } = await request.json();

  if (!email || !supabaseUserId) {
    return NextResponse.json({ error: "email and supabaseUserId required" }, { status: 400 });
  }

  try {
    const appUser = await ensureAppUserFromSupabase(email, supabaseUserId);
    return NextResponse.json({ ok: true, appUser });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
