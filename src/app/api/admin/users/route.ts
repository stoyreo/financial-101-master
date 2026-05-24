/**
 * /api/admin/users — Supabase-backed user registry.
 * Replaces the previous filesystem-based implementation so Vercel
 * and Cloudflare read from the same durable store.
 *
 * IMPORTANT (2026-04-26): This endpoint also manages Supabase Auth users
 * (auth.users), not just the app_users registry. Login uses
 * supabase.auth.signInWithPassword() which checks auth.users — so writing
 * a password_hash to app_users alone does NOT enable login. POST creates
 * an auth user; PATCH with `password` updates (or creates) the auth user.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin, appUserToRow, rowToAppUser, AppUserRow } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Find a Supabase Auth user by email, paginating through admin.listUsers().
 * Supabase JS SDK doesn't expose an email filter, so we scan. Fine for
 * small user bases (<1000). Returns null if not found.
 */
async function findAuthUserByEmail(
  db: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  // Cap pagination to avoid infinite loops
  for (let i = 0; i < 25; i++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? target };
    if (users.length < perPage) return null;
    page += 1;
  }
  return null;
}

/**
 * Ensure a Supabase Auth user exists for `email` with `password`.
 * - Creates the user if none exists (email_confirm: true so they can log in
 *   immediately without an email-verification round-trip).
 * - If the user already exists, updates their password.
 */
async function upsertAuthUser(
  db: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  password: string,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: true; authId: string } | { ok: false; error: string }> {
  // Try create first
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (!createErr && created?.user) {
    return { ok: true, authId: created.user.id };
  }

  // If already exists, look it up and update the password
  const msg = String(createErr?.message ?? "").toLowerCase();
  const alreadyRegistered =
    msg.includes("already") || msg.includes("registered") || msg.includes("exists");
  if (!alreadyRegistered) {
    return { ok: false, error: createErr?.message ?? "createUser failed" };
  }

  const existing = await findAuthUserByEmail(db, email);
  if (!existing) {
    return { ok: false, error: "auth user create reported duplicate but lookup failed" };
  }
  const { error: updErr } = await db.auth.admin.updateUserById(existing.id, {
    password,
    user_metadata: metadata,
  });
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, authId: existing.id };
}

export async function GET(_req: NextRequest) {
  try {
    // Authenticate user
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[GET /api/admin/users]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ users: (data ?? []).map((r: AppUserRow) => rowToAppUser(r)) });
  } catch (err: any) {
    console.error("[GET /api/admin/users]", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user and verify admin role
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data: appUser, error: userErr } = await db
      .from("app_users")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    if (userErr || !appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // Bulk replace
    if (Array.isArray(body?.users)) {
      const users = body.users as any[];
      if (!users.some((u) => u.role === "admin")) {
        return NextResponse.json(
          { ok: false, error: "registry must contain at least one admin" },
          { status: 400 },
        );
      }
      const rows = users.map(appUserToRow);
      const { error: delErr } = await db.from("app_users").delete().neq("id", "__never__");
      if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
      if (rows.length) {
        const { error: insErr } = await db.from("app_users").insert(rows);
        if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, count: rows.length, savedAt: new Date().toISOString() });
    }

    // Single add
    const user = body?.user;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!user || !user.id || !user.email || !user.username) {
      return NextResponse.json(
        { ok: false, error: "user payload is required (id, email, username)" },
        { status: 400 },
      );
    }

    const email = String(user.email).toLowerCase();
    const username = String(user.username);
    const { data: existing, error: selErr } = await db
      .from("app_users")
      .select("id,username,email")
      .or(`id.eq.${user.id},email.eq.${email},username.eq.${username}`);
    if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
    if (existing?.some((r: any) => r.id === user.id)) {
      return NextResponse.json({ ok: false, error: "id_taken" }, { status: 409 });
    }
    if (existing?.some((r: any) => String(r.email).toLowerCase() === email)) {
      return NextResponse.json({ ok: false, error: "email_taken" }, { status: 409 });
    }
    if (existing?.some((r: any) => String(r.username).toLowerCase() === username.toLowerCase())) {
      return NextResponse.json({ ok: false, error: "username_taken" }, { status: 409 });
    }

    // Provision the Supabase Auth user FIRST so we don't insert an app_users
    // row that we can't actually log in as. If no password was provided
    // (legacy/magic-link flow), skip auth provisioning.
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { ok: false, error: "password must be at least 6 characters" },
          { status: 400 },
        );
      }
      const auth = await upsertAuthUser(db, email, password, {
        app_user_id: user.id,
        username,
        role: user.role,
      });
      if (!auth.ok) {
        return NextResponse.json(
          { ok: false, error: `auth provisioning failed: ${auth.error}` },
          { status: 500 },
        );
      }
    }

    const { error: insErr } = await db.from("app_users").insert(appUserToRow(user));
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      user,
      authProvisioned: Boolean(password),
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[POST /api/admin/users]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Authenticate user and verify admin role
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data: appUser, error: userErr } = await db
      .from("app_users")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    if (userErr || !appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { id, patch } = body ?? {};
    const password = typeof body?.password === "string" ? body.password : "";
    if (!id || typeof id !== "string" || !patch || typeof patch !== "object") {
      return NextResponse.json({ ok: false, error: "id and patch are required" }, { status: 400 });
    }
    const { data: target, error: getErr } = await db
      .from("app_users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (getErr) return NextResponse.json({ ok: false, error: getErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    // Last-admin guard
    const wouldLoseAdminRole = patch.role && patch.role !== "admin";
    const wouldDeactivate = patch.isActive === false;
    if (target.role === "admin" && (wouldLoseAdminRole || wouldDeactivate)) {
      const { count, error: cntErr } = await db
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true)
        .neq("id", id);
      if (cntErr) return NextResponse.json({ ok: false, error: cntErr.message }, { status: 500 });
      if (!count || count === 0) {
        return NextResponse.json({ ok: false, error: "cannot_demote_last_admin" }, { status: 400 });
      }
    }

    // Password reset: actually update the Supabase Auth password (or create
    // the auth user retroactively if it never existed). Without this step,
    // signInWithPassword would still reject the new password.
    let authProvisioned = false;
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { ok: false, error: "password must be at least 6 characters" },
          { status: 400 },
        );
      }
      const email = String(target.email).toLowerCase();
      const auth = await upsertAuthUser(db, email, password, {
        app_user_id: target.id,
        username: target.username,
        role: target.role,
      });
      if (!auth.ok) {
        return NextResponse.json(
          { ok: false, error: `auth password update failed: ${auth.error}` },
          { status: 500 },
        );
      }
      authProvisioned = true;
    }

    const merged = { ...rowToAppUser(target as AppUserRow), ...patch, id: target.id };
    const { error: updErr } = await db
      .from("app_users")
      .update(appUserToRow(merged))
      .eq("id", id);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      user: merged,
      authProvisioned,
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[PATCH /api/admin/users]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Authenticate user and verify admin role
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data: appUser, error: userErr } = await db
      .from("app_users")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    if (userErr || !appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let userId = req.nextUrl.searchParams.get("id");
    if (!userId) {
      try {
        const body = await req.json();
        if (body?.id && typeof body.id === "string") userId = body.id;
      } catch {
        /* no body — fine */
      }
    }
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "User ID required (?id= or JSON body {id})" },
        { status: 400 },
      );
    }

    const { data: target, error: selErr } = await db
      .from("app_users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

    // Idempotent: not found = already gone.
    if (!target) {
      return NextResponse.json({
        ok: true,
        removed: userId,
        note: "not_in_server_registry",
        savedAt: new Date().toISOString(),
      });
    }
    if (target.role === "admin") {
      return NextResponse.json({ ok: false, error: "cannot_remove_admin" }, { status: 400 });
    }

    const { error: delErr } = await db.from("app_users").delete().eq("id", userId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    // Best-effort cleanup of the user's data blob
    if (target.storage_key && /^[A-Za-z0-9_-]+$/.test(target.storage_key)) {
      await db.from("user_data").delete().eq("storage_key", target.storage_key);
    }

    // Best-effort cleanup of the Supabase Auth user. If we leave it behind,
    // the email becomes "stuck" — re-adding the same email would collide
    // with the orphaned auth row.
    try {
      if (target.email) {
        const authRow = await findAuthUserByEmail(db, String(target.email));
        if (authRow) {
          await db.auth.admin.deleteUser(authRow.id);
        }
      }
    } catch (e) {
      console.warn("[DELETE /api/admin/users] auth cleanup failed (non-fatal):", e);
    }

    return NextResponse.json({ ok: true, removed: userId, savedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("[DELETE /api/admin/users]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
