"use client";
import { useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";
import { ensureAppUserFromSupabase, synthesizeSession } from "@/lib/auth-client";

function LineCallbackContent() {
  const router = useRouter();

  useEffect(() => {
    const handleLineCallback = async () => {
      // Read params directly from window.location to avoid the Next.js
      // useSearchParams() hydration race where it returns empty params on the
      // first render (before client-side hydration) and fires the effect early,
      // causing an immediate redirect to /login before the real params arrive.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state") || "";
      const lineError = params.get("error");
      const lineErrorDesc = params.get("error_description");

      if (!code) {
        console.error("LINE auth rejected:", lineError, lineErrorDesc);
        // For sync mode, bounce back to actuals with an error flag
        if (state === "sync") {
          router.replace("/expenses/actuals?line_error=cancelled");
          return;
        }
        router.replace(
          `/login?error=line_failed&line_error=${encodeURIComponent(lineError || "no_code")}&desc=${encodeURIComponent(lineErrorDesc || "")}`
        );
        return;
      }

      try {
        const response = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            redirectUri: `${window.location.origin}/auth/line/callback`,
          }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
          console.error("LINE exchange error:", data.error);
          if (state === "sync") {
            router.replace("/expenses/actuals?line_error=auth_failed");
            return;
          }
          router.replace("/login?error=line_failed");
          return;
        }

        const { email, lineUserId, supabaseTokenHash } = data;

        if (!lineUserId) {
          if (state === "sync") {
            router.replace("/expenses/actuals?line_error=no_uid");
            return;
          }
          router.replace("/login?error=line_failed");
          return;
        }

        // ── Sync-only mode ────────────────────────────────────────────────
        // The user clicked "Connect with LINE" in the Actuals sync panel.
        // We only need their LINE UID — skip full session synthesis and
        // bounce straight back to actuals with the UID as a query param.
        if (state === "sync") {
          window.location.href = `/expenses/actuals?line_uid=${encodeURIComponent(lineUserId)}`;
          return;
        }

        // ── Full login mode (default) ─────────────────────────────────────
        if (!email) {
          router.replace("/login?error=line_failed");
          return;
        }

        // Establish a real Supabase browser session so the sync API can
        // authenticate via supabase.auth.getUser() (cookie-based).
        // Without this, LINE users always get "Remote: error" on the dashboard.
        // The server generated a magic-link token_hash; we exchange it here for
        // a real session (verifyOtp sets the Supabase auth cookies in the browser).
        if (supabaseTokenHash) {
          try {
            const { getSupabaseBrowser } = await import("@/lib/supabase/client");
            const supabase = getSupabaseBrowser();
            const { error: otpErr } = await supabase.auth.verifyOtp({
              token_hash: supabaseTokenHash,
              type: "magiclink",
            });
            if (otpErr) {
              console.warn("Failed to verify Supabase OTP token:", otpErr.message);
            }
          } catch (sessionErr) {
            // Non-fatal: app session still works; sync will retry on next load
            console.warn("Failed to set Supabase browser session:", sessionErr);
          }
        }

        const appUser = await ensureAppUserFromSupabase(email, lineUserId);
        if (!appUser) {
          router.replace("/login?error=line_failed");
          return;
        }

        synthesizeSession(appUser, { lineUserId });
        window.location.href = "/";
      } catch (err) {
        console.error("LINE callback error:", err);
        if (state === "sync") {
          router.replace("/expenses/actuals?line_error=exception");
          return;
        }
        router.replace("/login?error=line_failed");
      }
    };

    handleLineCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function LineCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LineCallbackContent />
    </Suspense>
  );
}
