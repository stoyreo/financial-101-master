/**
 * SERVER-ONLY AUTH UTILITIES
 *
 * Shared authentication for API routes. Do not import from "use client" files.
 *
 * Provides:
 *  - getAuthenticatedUserStorageKey() — resolves the calling user's storageKey
 *    from either a Supabase session cookie (Path A) or a signed fp_storage_key
 *    cookie (Path B), verifying the user exists and is active.
 *  - requireUser() — thin wrapper for route handlers: returns either the
 *    authenticated { storageKey, userId } or a ready-to-return 401 NextResponse.
 *  - signStorageKey() — HMAC-signs a storageKey for use in the fp_storage_key
 *    cookie, so it can no longer be forged by a client that merely guesses or
 *    brute-forces a valid storage_key value.
 *
 * 🔐 SECURITY FIX (2026-07-02): fp_storage_key was previously trusted as a
 * raw, unsigned, client-settable cookie value — anyone who learned (or
 * guessed) a valid storage_key could set this cookie and get full read/write
 * access to that user's data via /api/sync, with no Supabase session at all.
 * It is now required to be in the form "<storageKey>.<hmac-sha256-hex>",
 * verified with a server-only secret before the storageKey is trusted.
 * Nothing in the codebase currently *sets* this cookie (the LINE-login path
 * that used to write it has been superseded by Supabase sessions) — if that
 * flow is reintroduced, it MUST call signStorageKey() when setting the
 * cookie, or Path B will always reject it.
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, rowToAppUser } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

const STORAGE_KEY_RE = /^[A-Za-z0-9_-]+$/;

function getCookieSigningSecret(): string {
  // Prefer a dedicated secret; fall back to the service-role key (already
  // server-only and high-entropy) so this works without extra setup, but a
  // dedicated COOKIE_SIGNING_SECRET is recommended for production so
  // rotating one doesn't rotate the other.
  const secret = process.env.COOKIE_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "Missing COOKIE_SIGNING_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback) — cannot sign/verify the fp_storage_key cookie",
    );
  }
  return secret;
}

/** Sign a storageKey for safe storage in the fp_storage_key cookie. */
export function signStorageKey(storageKey: string): string {
  if (!STORAGE_KEY_RE.test(storageKey)) {
    throw new Error("refusing to sign a storageKey with invalid characters");
  }
  const sig = crypto.createHmac("sha256", getCookieSigningSecret()).update(storageKey).digest("hex");
  return `${storageKey}.${sig}`;
}

/** Verify a signed fp_storage_key cookie value; returns the storageKey or null. */
function verifySignedStorageKey(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0 || idx === signed.length - 1) return null;
  const storageKey = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  if (!STORAGE_KEY_RE.test(storageKey)) return null;
  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;

  try {
    const expected = crypto.createHmac("sha256", getCookieSigningSecret()).update(storageKey).digest("hex");
    const a = Buffer.from(sig.toLowerCase(), "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return storageKey;
  } catch {
    return null;
  }
}

export type AuthResult =
  | { ok: true; storageKey: string; userId: string }
  | { ok: false; error: string; status: number };

/**
 * Resolve the authenticated user's storageKey from either:
 *  - Path A: an active Supabase session cookie (email/password, Google OAuth), or
 *  - Path B: a signed fp_storage_key cookie (see module docblock).
 * Verifies the corresponding app_users row exists and is active in both cases.
 */
export async function getAuthenticatedUserStorageKey(): Promise<AuthResult> {
  try {
    // ── Path A: Supabase session cookie ────────────────────────────────
    const supabase = getSupabaseServer();
    const {
      data: { user: supabaseUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (!authError && supabaseUser) {
      const adminDb = getSupabaseAdmin();
      const { data: userRows, error: queryError } = await adminDb
        .from("app_users")
        .select("*")
        .eq("email", supabaseUser.email?.toLowerCase() || "")
        .maybeSingle();

      if (queryError) {
        console.error("[getAuthenticatedUserStorageKey] Supabase path query error:", queryError.message);
        return { ok: false, error: `database error: ${queryError.message}`, status: 500 };
      }
      if (!userRows) {
        // Fallback: look up by supabase_user_id (handles email mismatch).
        const { data: byUid } = await adminDb
          .from("app_users").select("*")
          .eq("supabase_user_id", supabaseUser.id).maybeSingle();
        if (byUid) {
          const appUser = rowToAppUser(byUid as any);
          if (!appUser.isActive) return { ok: false, error: "unauthorized: inactive", status: 401 };
          return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
        }
        console.warn("[getAuthenticatedUserStorageKey] Not found:", supabaseUser.email);
        return { ok: false, error: "unauthorized: user not found in app registry", status: 401 };
      }
      const appUser = rowToAppUser(userRows as any);
      if (!appUser.isActive) {
        return { ok: false, error: "unauthorized: user account is inactive", status: 401 };
      }
      return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
    }

    // ── Path B: signed fp_storage_key cookie (non-Supabase auth flows) ──
    const rawStorageKey = cookies().get("fp_storage_key")?.value;
    if (rawStorageKey) {
      const decoded = decodeURIComponent(rawStorageKey);
      const storageKey = verifySignedStorageKey(decoded);
      if (storageKey) {
        const adminDb = getSupabaseAdmin();
        const { data: userRows, error: queryError } = await adminDb
          .from("app_users")
          .select("*")
          .eq("storage_key", storageKey)
          .maybeSingle();

        if (!queryError && userRows) {
          const appUser = rowToAppUser(userRows as any);
          if (appUser.isActive) {
            return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
          }
        }
      } else {
        console.warn("[getAuthenticatedUserStorageKey] fp_storage_key cookie present but signature invalid/missing — rejecting");
      }
    }

    return { ok: false, error: "unauthorized: not authenticated", status: 401 };
  } catch (err: any) {
    console.error("[getAuthenticatedUserStorageKey] Error:", err);
    return { ok: false, error: `error: ${String(err?.message ?? err)}`, status: 500 };
  }
}

/**
 * Route-handler guard. Usage:
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return auth.response;
 *   // auth.storageKey / auth.userId are available below
 */
export async function requireUser(): Promise<
  | { ok: true; storageKey: string; userId: string }
  | { ok: false; response: NextResponse }
> {
  const result = await getAuthenticatedUserStorageKey();
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: result.error }, { status: result.status }),
    };
  }
  return { ok: true, storageKey: result.storageKey, userId: result.userId };
}
