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

      if (!code) {
        router.replace("/login?error=line_failed");
        return;
      }

      try {
        // POST code to our API route to exchange for LINE user info
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
          router.replace("/login?error=line_failed");
          return;
        }

        const { email, lineUserId } = data;

        if (!email || !lineUserId) {
          console.error("Missing email or lineUserId from LINE exchange");
          router.replace("/login?error=line_failed");
          return;
        }

        // Ensure AppUser exists or create one
        const appUser = await ensureAppUserFromSupabase(email, lineUserId);

        if (!appUser) {
          console.error("Failed to create or retrieve AppUser");
          router.replace("/login?error=line_failed");
          return;
        }

        // Synthesize session
        synthesizeSession(appUser);

        // Redirect to home
        router.replace("/");
      } catch (err) {
        console.error("LINE callback error:", err);
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
