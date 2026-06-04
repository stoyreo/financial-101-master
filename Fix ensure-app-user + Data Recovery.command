#!/bin/bash
# ROOT FIX — rewrites /api/auth/ensure-app-user to use admin client
# Fixes: actuals redirect, sync bar gone, data recovery for icloud account

set -e
echo "══════════════════════════════════════════════"
echo "  Fix ensure-app-user (root cause of all issues)"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

cat > src/app/api/auth/ensure-app-user/route.ts << 'ROUTEOF'
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, rowToAppUser } from "@/lib/supabase/admin";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/ensure-app-user
 *
 * Finds or creates an app_users row for the given Supabase user.
 * Uses admin client to bypass RLS.
 *
 * Resolution order:
 *  1. Find by supabase_user_id (fast path)
 *  2. Find by email + back-fill supabase_user_id
 *     (covers toy.theeranan@icloud.com and pre-Supabase accounts)
 *  3. Create new row with all required fields
 */
export async function POST(request: NextRequest) {
  let email = "";
  let supabaseUserId = "";
  try {
    const body = await request.json();
    email = (body.email ?? "").toLowerCase().trim();
    supabaseUserId = (body.supabaseUserId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!email || !supabaseUserId) {
    return NextResponse.json({ error: "email and supabaseUserId required" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // Path 1: already linked by supabase_user_id
    const { data: byUid } = await db
      .from("app_users")
      .select("*")
      .eq("supabase_user_id", supabaseUserId)
      .maybeSingle();

    if (byUid) {
      return NextResponse.json({ ok: true, appUser: rowToAppUser(byUid) });
    }

    // Path 2: existing row matched by email — back-fill supabase_user_id
    const { data: byEmail } = await db
      .from("app_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (byEmail) {
      await db
        .from("app_users")
        .update({ supabase_user_id: supabaseUserId })
        .eq("id", byEmail.id);
      return NextResponse.json({
        ok: true,
        appUser: rowToAppUser({ ...byEmail, supabase_user_id: supabaseUserId }),
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
      return NextResponse.json(
        { ok: false, error: createErr?.message ?? "insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, appUser: rowToAppUser(created) });
  } catch (err: any) {
    console.error("[ensure-app-user] unexpected error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
ROUTEOF

echo "✓ ensure-app-user/route.ts rewritten"

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/api/auth/ensure-app-user/route.ts
git commit -m "fix(critical): rewrite ensure-app-user — admin client + email fallback

Fixes: actuals redirect, sync bar gone, data not loading for icloud account.

Root cause: old route used anon client (RLS blocked reads) and only sent
3 fields on insert — app_users requires id, username, storage_key etc.
Every call 500ed, breaking the auth bridge chain silently.

Fix: admin client + 3-path resolution (uid → email → create)"

git push origin main
echo ""
echo "══════════════════════════════════════════════"
echo "  Deployed. After Vercel builds (~1 min):"
echo "  → Reload the app"
echo "  → toy.theeranan@icloud.com data restores"
echo "  → Actuals page works"
echo "  → Sync bar returns"
echo "══════════════════════════════════════════════"
