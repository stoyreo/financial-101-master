"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession, clearSession, ensureAppUserFromSupabase, synthesizeSession } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getSupabaseBrowser } from "@/lib/supabase/client";

const PUBLIC_PATHS = ["/login", "/login/"];

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
              if (__loadedStorageKey !== appUser.storageKey) {
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
    if (__loadedStorageKey !== session.storageKey) {
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
