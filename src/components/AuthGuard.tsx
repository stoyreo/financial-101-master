"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession, clearSession, ensureAppUserFromSupabase, synthesizeSession } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// 🔐 Paths that must NOT be blocked by AuthGuard.
// `/auth/line/callback` and `/auth/callback` are OAuth landing pages — the
// session hasn't been synthesized yet when they first mount. If AuthGuard
// runs its session check there, it races the LINE/Supabase code-exchange
// useEffect, loses (clearSession + router.replace("/login")), and the user
// bounces to /login before the callback can finish writing the session.
// They must be treated as public so the callback page is the only thing
// that decides where to send the user.
const PUBLIC_PATHS = [
  "/login",
  "/login/",
  "/auth/line/callback",
  "/auth/line/callback/",
  "/auth/callback",
  "/auth/callback/",
];

// Module-scope flag: track which storageKey we've already hydrated from
// the server in this browser session. We must NOT call loadUserNamespace
// on every nav -- it fetches stale remote data and can clobber unsynced
// in-memory state (e.g. transactions imported seconds ago that haven't
// finished the AutoSync debounce yet).
let __loadedStorageKey: string | null = null;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const { loadUserNamespace } = useStore();
  const didCheckRef = useRef(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
    if (isPublic) { setAuthed(true); return; }

    const session = getSession();
    if (!session) {
      // Check for Supabase session (OAuth callback)
      (async () => {
        try {
          const supabase = getSupabaseBrowser();
          const { data: { session: sbSession } } = await supabase.auth.getSession();
          if (sbSession?.user?.email) {
            const appUser = await ensureAppUserFromSupabase(sbSession.user.email, sbSession.user.id);
            if (appUser) {
              synthesizeSession(appUser);
              // Also re-hydrate when the store says it isn't hydrated yet
              // (clearSession resets isHydratedFromRemote, but the module-
              // scope __loadedStorageKey doesn't reset on logout — so a
              // same-user logout→login would otherwise skip the GET and
              // leave AutoSync POSTs blocked on "Not yet hydrated").
              const isHydrated = useStore.getState().isHydratedFromRemote;
              if (__loadedStorageKey !== appUser.storageKey || !isHydrated) {
                __loadedStorageKey = appUser.storageKey;
                try {
                  await loadUserNamespace();
                } catch (err) {
                  console.error("[AuthGuard] Failed to load user namespace:", err);
                  // Continue anyway - store will use localStorage fallback
                }
              }
              setAuthed(true);
              return;
            }
          }
        } catch (err) {
          console.error("[AuthGuard] OAuth callback failed:", err);
        }

        clearSession();
        router.replace("/login");
      })();
      return;
    }
    // Only hydrate from the server ONCE per session. Subsequent navigations
    // rely on the Zustand persist middleware (localStorage) + AutoSync to
    // keep state coherent. Re-fetching from /api/sync on every nav races
    // with the 800ms AutoSync debounce and wipes freshly-imported data.
    //
    // BUT: we MUST re-hydrate after a logout (clearSession resets
    // isHydratedFromRemote=false). The module-scope __loadedStorageKey is
    // not reset by logout, so a same-user logout→login in the same tab
    // would otherwise short-circuit this block, leaving the store in a
    // never-hydrated state and AutoSync POSTs permanently blocked
    // with "Not yet hydrated from remote". Re-checking isHydratedFromRemote
    // fixes that without re-fetching on every navigation.
    const isHydrated = useStore.getState().isHydratedFromRemote;
    if (__loadedStorageKey !== session.storageKey || !isHydrated) {
      __loadedStorageKey = session.storageKey;
      // Await namespace load so the dashboard never renders with stale seed data
      (async () => {
        try {
          await loadUserNamespace();
        } catch (err) {
          console.error("[AuthGuard] Failed to load user namespace:", err);
          // Store will fall back to localStorage/seed — still show the page
        }
        setAuthed(true);
        didCheckRef.current = true;
      })();
      return; // don't fall through to setAuthed below
    }
    setAuthed(true);
    didCheckRef.current = true;
  }, [pathname]);

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return <>{children}</>;
}
