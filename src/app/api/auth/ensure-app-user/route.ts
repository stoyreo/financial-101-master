import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, rowToAppUser } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/ensure-app-user
 *
 * Finds or creates the app_users row for the CURRENTLY SIGNED-IN Supabase user.
 *
 * 🔐 SECURITY FIX (2026-09-16): This route used to trust `email` and
 * `supabaseUserId` from the request body with no authentication. Anyone could
 * POST a victim's email and (a) receive their storageKey + profile, and
 * (b) overwrite the victim's supabase_user_id with their own, which
 * getAuthenticatedUserStorageKey() then used as a fallback lookup — i.e. full
 * account takeover of the victim's financial data via /api/sync.
 *
 * Now:
 *  - Identity comes ONLY from a verified Supabase session — either an
 *    `Authorization: Bearer <access_token>` header or the Supabase auth cookie.
 *    Any email/supabaseUserId in the body is ignored.
 *  - An existing supabase_user_id link is never overwritten, unless the
 *    previously linked Supabase auth user no longer exists (account re-created).
 *  - The response never includes passwordHash. storageKey is returned only to
 *    its verified owner (the legacy client session needs it).
 *
 * Resolution order:
 *  1. Find by supabase_user_id (fast path)
 *  2. Find by verified email + link supabase_user_id (if unlinked / stale)
 *  3. Create new row with all required fields
 */

type VerifiedUser = { id: string; email: string };

async function getVerifiedUser(request: NextRequest): Promise<VerifiedUser | null> {
  // Path 1: bearer access token (sent explicitly by login page / AuthGuard)
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const { data, error } = await getSupabaseAdmin().auth.getUser(match[1].trim());
    if (!error && data.user?.id && data.user.email) {
      return { id: data.user.id, email: data.user.email.toLowerCase().trim() };
    }
    return null; // a bad token is a hard fail — don't fall through to cookies
  }

  // Path 2: Supabase auth cookie
  try {
    const { data, error } = await getSupabaseServer().auth.getUser();
    if (!error && data.user?.id && data.user.email) {
      return { id: data.user.id, email: data.user.email.toLowerCase().trim() };
    }
  } catch {
    /* no cookie session */
  }
  return null;
}

function publicAppUser(row: any) {
  const { passwordHash: _omit, ...rest } = rowToAppUser(row);
  return rest;
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`ensure-app-user:${getClientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const user = await getVerifiedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id: supabaseUserId, email } = user;

  try {
    const db = getSupabaseAdmin();

    // Path 1: already linked by supabase_user_id
    const { data: byUid } = await db
      .from("app_users")
      .select("*")
      .eq("supabase_user_id", supabaseUserId)
      .maybeSingle();

    if (byUid) {
      return NextResponse.json({ ok: true, appUser: publicAppUser(byUid) });
    }

    // Path 2: existing row matched by the VERIFIED email
    const { data: byEmail } = await db
      .from("app_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (byEmail) {
      const linkedId: string | null = byEmail.supabase_user_id || null;

      if (linkedId && linkedId !== supabaseUserId) {
        // Only re-link if the previously linked auth user is gone.
        const { data: prev } = await db.auth.admin.getUserById(linkedId);
        if (prev?.user) {
          console.warn(
            `[ensure-app-user] SECURITY: refusing to re-link app_user ${byEmail.id} ` +
              `(linked to ${linkedId}) to ${supabaseUserId}`,
          );
          return NextResponse.json(
            { ok: false, error: "account already linked to a different login" },
            { status: 409 },
          );
        }
      }

      if (linkedId !== supabaseUserId) {
        const { error: updErr } = await db
          .from("app_users")
          .update({ supabase_user_id: supabaseUserId })
          .eq("id", byEmail.id);
        if (updErr) console.error("[ensure-app-user] link update failed:", updErr.message);
      }
      return NextResponse.json({
        ok: true,
        appUser: publicAppUser({ ...byEmail, supabase_user_id: supabaseUserId }),
      });
    }

    // Path 3: brand-new user — create complete row
    const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "user";
    const storageKey = `fp_data_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const newRow = {
      id: uuid(),
      username,
      email,
      display_name: username,
      password_hash: "",
      role: "member",
      data_mode: "own",
      storage_key: storageKey,
      supabase_user_id: supabaseUserId,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      is_active: true,
    };

    const { data: created, error: createErr } = await db
      .from("app_users")
      .insert(newRow)
      .select()
      .single();

    if (createErr || !created) {
      console.error("[ensure-app-user] insert failed:", createErr?.message);
      return NextResponse.json({ ok: false, error: "could not create user" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, appUser: publicAppUser(created) });
  } catch (err: any) {
    console.error("[ensure-app-user] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
  }
}
