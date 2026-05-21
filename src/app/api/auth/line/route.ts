import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, redirectUri } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    const clientId = process.env.LINE_CLIENT_ID;
    const clientSecret = process.env.LINE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("LINE_CLIENT_ID or LINE_CLIENT_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/line/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("LINE token exchange failed:", errorData);
      return NextResponse.json(
        { error: "Failed to exchange authorization code", lineError: errorData },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, id_token } = tokenData;

    if (!id_token) {
      console.error("No id_token in LINE response");
      return NextResponse.json(
        { error: "Missing id_token from LINE" },
        { status: 400 }
      );
    }

    // Decode id_token (JWT: header.payload.signature)
    let email = "";
    let lineUserId = "";
    let displayName = "";

    try {
      const parts = id_token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }

      // Decode payload (second part)
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf-8")
      );

      email = payload.email || "";
      lineUserId = payload.sub || "";
      displayName = payload.name || "";
    } catch (decodeErr) {
      console.error("Failed to decode id_token:", decodeErr);
      return NextResponse.json(
        { error: "Failed to decode LINE token" },
        { status: 400 }
      );
    }

    // If no email in id_token, fetch from profile endpoint
    if (!email && access_token) {
      try {
        const profileResponse = await fetch("https://api.line.me/v2/profile", {
          headers: { Authorization: `Bearer ${access_token}` },
        });

        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          displayName = profile.displayName || displayName;
          // Generate synthetic email if not available
          if (!email && lineUserId) {
            email = `line_${lineUserId}@line.user`;
          }
        }
      } catch (profileErr) {
        console.error("Failed to fetch LINE profile:", profileErr);
        // Continue with synthetic email if we have lineUserId
        if (!email && lineUserId) {
          email = `line_${lineUserId}@line.user`;
        }
      }
    }

    // Fallback if still no email
    if (!email) {
      email = `line_${lineUserId}@line.user`;
    }

    // ── Create a real Supabase auth session so the sync API can authenticate ──
    // The sync route uses supabase.auth.getUser() (cookie-based). Without a
    // Supabase session, LINE users always get 401 → "Remote: error" on the dashboard.
    //
    // Strategy: use auth.admin.generateLink({ type: "magiclink" }) to get a
    // hashed_token. The client then calls supabase.auth.verifyOtp({ token_hash })
    // which exchanges it for a real browser session (sets Supabase cookies).
    let supabaseTokenHash: string | null = null;

    try {
      const adminDb = getSupabaseAdmin();

      // Ensure the Supabase auth user exists (email-confirmed, no password)
      const { data: listData } = await adminDb.auth.admin.listUsers();
      const existingAuthUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!existingAuthUser) {
        const { error: createErr } = await adminDb.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { line_user_id: lineUserId, display_name: displayName },
        });
        if (createErr) {
          console.error("[LINE auth] Failed to create Supabase auth user:", createErr.message);
        }
      }

      // Generate a one-time magic-link token the client can exchange for a session
      const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkErr) {
        console.error("[LINE auth] generateLink error:", linkErr.message);
      } else {
        supabaseTokenHash = (linkData as any)?.properties?.hashed_token ?? null;
      }
    } catch (sessionCreationErr) {
      // Non-fatal: local session still works; sync will degrade gracefully
      console.error("[LINE auth] Supabase session creation error:", sessionCreationErr);
    }

    return NextResponse.json({
      email,
      lineUserId,
      displayName,
      supabaseTokenHash,
    });
  } catch (err) {
    console.error("LINE auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
