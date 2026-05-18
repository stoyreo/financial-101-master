import { NextRequest, NextResponse } from "next/server";

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
        { error: "Failed to exchange authorization code" },
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

    return NextResponse.json({
      email,
      lineUserId,
      displayName,
    });
  } catch (err) {
    console.error("LINE auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
