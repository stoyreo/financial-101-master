"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { getSession, synthesizeSession, clearSession } from "@/lib/auth-client";
import { useStore } from "@/lib/store";

// Must stay in sync with providers.tsx PUBLIC_PATHS
const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/auth/line/callback"];

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Bridge: when a Supabase session exists but the legacy auth-client session
 * (fp_current_user in sessionStorage) is missing — e.g. after a hard refresh,
 * OAuth callback, or magic-link login — synthesize the legacy session so that
 * getCurrentAccount(), loadUserNamespace(), and AutoSync all work correctly.
 *
 * 🔐 CRITICAL: A stale legacy session (and the Zustand store it points at) can
 * survive in sessionStorage if a previous user never explicitly logged out
 * (e.g. handed the device/tab to someone else who then signed into their OWN
 * account). If we only checked "does a session exist", that stale session
 * would be reused for the NEW Supabase user, leaking the previous user's
 * cached financial data. So we must verify the existing legacy session's
 * email actually matches the currently authenticated Supabase user — if not,
 * wipe the store + session before re-bridging.
 */
async function bridgeLegacySession(supabaseUserId: string, email: string) {
  const existing = getSession();
  if (existing) {
    if (existing.email && email && existing.email.toLowerCase() === email.toLowerCase()) {
      return; // already set, and it's for the same user — safe to keep
    }
    // Mismatch (or unverifiable) — stale session from a different user. Clear it.
    useStore.getState().clearStore?.();
    clearSession();
  }
  try {
    const res = await fetch("/api/auth/ensure-app-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, supabaseUserId }),
    });
    if (!res.ok) return;
    const { appUser } = await res.json();
    if (appUser) synthesizeSession(appUser);
  } catch {
    // Non-fatal — app still works via Supabase session
  }
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Public pages bypass session check — render immediately
    const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
    if (isPublic) { setChecking(false); return; }

    const supabase = getSupabaseBrowser();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
      } else {
        // Ensure legacy session is always in sync with Supabase session
        await bridgeLegacySession(session.user.id, session.user.email ?? "");
        // Hydrate from remote (/api/sync) once the session is confirmed.
        // Without this, isHydratedFromRemote stays false and saves are skipped.
        useStore.getState().loadUserNamespace();
        setChecking(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // Clear Zustand store so next user doesn't see previous user's data
        useStore.getState().clearStore?.();
        router.replace("/login");
        return;
      }
      // 🔐 A different user just signed in on top of an existing legacy
      // session (e.g. device handed off without an explicit logout).
      // Wipe the stale store/session before bridging to the new identity.
      const cached = getSession();
      const newEmail = session.user.email ?? "";
      if (cached && cached.email && newEmail && cached.email.toLowerCase() !== newEmail.toLowerCase()) {
        useStore.getState().clearStore?.();
        clearSession();
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  if (checking) {
    return null;
  }

  return <>{children}</>;
}
