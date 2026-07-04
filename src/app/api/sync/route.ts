/**
 * /api/sync — Supabase-backed per-user data blob with AUTHORIZATION.
 * 🔐 CRITICAL FIX: Added authentication + authorization to prevent data leakage.
 *
 * Users can ONLY access their own storageKey (derived from their user record).
 * The client cannot specify arbitrary storageKeys — we enforce this server-side.
 *
 * Authentication itself (Supabase session cookie, or signed fp_storage_key
 * cookie) now lives in src/lib/server-auth.ts so every route shares the same
 * logic instead of each maintaining its own copy.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUserStorageKey } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeStorageKey(key: string): string | null {
  return key && /^[A-Za-z0-9_-]+$/.test(key) ? key : null;
}

export async function POST(req: NextRequest) {
  try {
    // ── Step 1: Authenticate the user ──────────────────────────
    const authResult = await getAuthenticatedUserStorageKey();
    if (!authResult.ok) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    const { storageKey: allowedStorageKey, userId } = authResult;

    // ── Step 2: Validate request payload ──────────────────────
    const body = await req.json().catch(() => ({}));
    const { storageKey: requestedStorageKey, data } = body;

    if (!requestedStorageKey || typeof requestedStorageKey !== "string") {
      return NextResponse.json({ ok: false, error: "storageKey is required in request body" }, { status: 400 });
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { ok: false, error: "data is required and must be an object" },
        { status: 400 },
      );
    }

    // ── Step 3: AUTHORIZATION CHECK — User can ONLY write to their own storageKey ──
    const sanitized = sanitizeStorageKey(requestedStorageKey);
    if (!sanitized) {
      return NextResponse.json({ ok: false, error: "invalid storageKey format" }, { status: 400 });
    }

    if (sanitized !== allowedStorageKey) {
      console.warn(`[POST /api/sync] SECURITY: User ${userId} attempted unauthorized write to ${sanitized} (allowed: ${allowedStorageKey})`);
      return NextResponse.json(
        { ok: false, error: "forbidden: you can only write to your own storageKey" },
        { status: 403 },
      );
    }

    // ── Step 4: Write to Supabase ──────────────────────────────
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("user_data")
      .upsert(
        { storage_key: sanitized, data, updated_at: new Date().toISOString() },
        { onConflict: "storage_key" },
      );
    if (error) {
      console.error("[POST /api/sync] Supabase error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("[POST /api/sync]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    // ── Step 1: Authenticate the user ──────────────────────────
    const authResult = await getAuthenticatedUserStorageKey();
    if (!authResult.ok) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    const { storageKey: allowedStorageKey, userId } = authResult;

    // ── Step 2: Validate query parameter ──────────────────────
    const requestedStorageKey = req.nextUrl.searchParams.get("storageKey");
    if (!requestedStorageKey) {
      return NextResponse.json(
        { ok: false, error: "storageKey query param is required" },
        { status: 400 },
      );
    }

    const sanitized = sanitizeStorageKey(requestedStorageKey);
    if (!sanitized) {
      return NextResponse.json({ ok: false, error: "invalid storageKey format" }, { status: 400 });
    }

    // ── Step 3: AUTHORIZATION CHECK — User can ONLY read their own storageKey ──
    if (sanitized !== allowedStorageKey) {
      console.warn(`[GET /api/sync] SECURITY: User ${userId} attempted unauthorized read of ${sanitized} (allowed: ${allowedStorageKey})`);
      return NextResponse.json(
        { ok: false, error: "forbidden: you can only read your own storageKey" },
        { status: 403 },
      );
    }

    // ── Step 4: Read from Supabase ─────────────────────────────
    const db = getSupabaseAdmin();
    const { data: row, error } = await db
      .from("user_data")
      .select("data")
      .eq("storage_key", sanitized)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/sync] Supabase error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: (row as any).data });
  } catch (err: any) {
    console.error("[GET /api/sync]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
