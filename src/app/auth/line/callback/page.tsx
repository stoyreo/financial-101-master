"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";
import { ensureAppUserFromSupabase, synthesizeSession } from "@/lib/auth";

function LineCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const handleLineCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state") || "";
      const lineError = searchParams.get("error");
      const lineErrorDesc = searchParams.get("error_description");

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

        const { email, lineUserId } = data;

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
  }, [searchParams, router]);

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
