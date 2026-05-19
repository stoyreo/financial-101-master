import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/line/callback", "/auth/session-init"];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p + "/"));
  // 🔐 CRITICAL: /api/sync needs Supabase auth setup, so don't skip it in middleware
  const isSkippableAPI = path.startsWith("/api/") && !path.startsWith("/api/sync");
  const isAsset = path.startsWith("/_next") || isSkippableAPI || path.includes(".");

  // Skip auth check for public paths and assets
  if (isPublic || isAsset) {
    return res;
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (n) => req.cookies.get(n)?.value,
          set: (n, v, o: CookieOptions) => {
            res.cookies.set({ name: n, value: v, ...o });
          },
          remove: (n, o: CookieOptions) => {
            res.cookies.set({ name: n, value: "", ...o });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return res;
  } catch (error) {
    // If auth check fails, redirect to login as a safe fallback
    console.error("[Middleware] Auth check failed:", error);
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
