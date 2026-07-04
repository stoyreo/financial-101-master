/**
 * /api/investments/radar-store — Supabase-backed per-user blob for the
 * AI Short-Term Radar: pinned watchlist, scan history, and alert settings.
 *
 * Stored in the existing `user_data` table under a NAMESPACED key
 * (`${storageKey}__radar`) so it never collides with the main app blob.
 *
 * 🔐 Same authorization model as /api/sync: the row key is derived
 * server-side from the authenticated user — the client can NEVER pass a
 * storage key. See CLAUDE.md multi-user isolation checklist.
 *
 * GET  → { ok, data: { watchlist, scans, alerts } }
 * POST → body may contain any of { watchlist, scans, alerts }; provided
 *        fields replace the stored ones (client owns merge logic).
 *
 * alerts = { enabled: boolean, lineUserId?: string }
 * lineUserId (from LINE Login) is stored ONLY when the user explicitly
 * enables LINE alerts (opt-in) — the daily cron pushes to it via the LINE
 * Messaging API (LINE Notify was discontinued 2025-03-31; see line-push.ts).
 * Disabling alerts deletes the id from the blob.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUserStorageKey } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WATCHLIST = 12;
const MAX_SCANS = 20;

// Next.js route files may only export HTTP handlers — keep this local.
// (The cron route finds these rows via `LIKE '%__radar'`.)
function radarKey(storageKey: string): string {
  return `${storageKey}__radar`;
}

async function auth() {
  const res = await getAuthenticatedUserStorageKey();
  if (!res.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: res.error }, { status: res.status }) };
  }
  return { ok: true as const, key: radarKey(res.storageKey) };
}

export async function GET(_req: NextRequest) {
  const a = await auth();
  if (!a.ok) return a.response;
  try {
    const db = getSupabaseAdmin();
    const { data: row, error } = await db.from("user_data").select("data").eq("storage_key", a.key).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const data = (row?.data as any) ?? {};
    return NextResponse.json({
      ok: true,
      data: {
        watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
        scans: Array.isArray(data.scans) ? data.scans : [],
        alerts: data.alerts && typeof data.alerts === "object" ? { enabled: !!data.alerts.enabled, hasLineUser: !!data.alerts.lineUserId } : { enabled: false, hasLineUser: false },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await auth();
  if (!a.ok) return a.response;
  try {
    const body = await req.json().catch(() => ({}));
    const db = getSupabaseAdmin();

    const { data: row } = await db.from("user_data").select("data").eq("storage_key", a.key).maybeSingle();
    const current = ((row?.data as any) ?? {}) as Record<string, any>;

    const next = { ...current };
    if (Array.isArray(body.watchlist)) next.watchlist = body.watchlist.slice(0, MAX_WATCHLIST);
    if (Array.isArray(body.scans)) next.scans = body.scans.slice(0, MAX_SCANS);
    if (body.appendScan && typeof body.appendScan === "object") {
      // Convenience for the radar: push a new scan record without the client
      // having to read-modify-write the whole scans array.
      const scans = Array.isArray(next.scans) ? next.scans : Array.isArray(current.scans) ? current.scans : [];
      next.scans = [body.appendScan, ...scans].slice(0, MAX_SCANS);
    }
    if (body.alerts && typeof body.alerts === "object") {
      const enabled = !!body.alerts.enabled;
      next.alerts = enabled
        ? { enabled: true, lineUserId: typeof body.alerts.lineUserId === "string" && body.alerts.lineUserId ? body.alerts.lineUserId : current?.alerts?.lineUserId ?? "" }
        : { enabled: false }; // opt-out wipes the stored LINE user id
    }

    const { error } = await db
      .from("user_data")
      .upsert({ storage_key: a.key, data: next, updated_at: new Date().toISOString() }, { onConflict: "storage_key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
