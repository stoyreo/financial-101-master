/**
 * POST /api/auth/google-drive-refresh
 *
 * Server-side token refresh for Google Drive OAuth2.
 * The browser sends a refresh token, server uses CLIENT_SECRET
 * (stored in env vars, never exposed to browser) to get a new access token.
 *
 * This prevents the secret from being leaked to the client.
 */

import { NextResponse } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function POST(req: Request) {
  try {
    const { refreshToken } = (await req.json()) as { refreshToken?: string };

    if (!refreshToken) {
      return NextResponse.json(
        { error: "refresh_token_required" },
        { status: 400 }
      );
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Google Drive credentials not configured");
      return NextResponse.json(
        { error: "google_drive_not_configured" },
        { status: 500 }
      );
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || "token_refresh_failed" },
        { status: 401 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Some responses don't include new refresh token
      expires_in: data.expires_in,
    });
  } catch (e: any) {
    console.error("[POST /api/auth/google-drive-refresh]", e);
    return NextResponse.json(
      { error: e?.message ?? "refresh_failed" },
      { status: 500 }
    );
  }
}
