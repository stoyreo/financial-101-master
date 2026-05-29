"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Check if already authenticated
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/");
        return;
      }
      // Show LINE error details if redirected back from LINE auth failure
      const urlError = searchParams.get("error");
      const lineError = searchParams.get("line_error");
      const lineDesc = searchParams.get("desc");
      if (urlError === "line_failed") {
        const detail = lineError ? ` (${lineError}${lineDesc ? ": " + lineDesc : ""})` : "";
        setErrorMsg(`LINE sign-in failed${detail}. Please try again or use email.`);
        setState("error");
        console.error("[LINE] Auth failed:", lineError, lineDesc);
      }
      setReady(true);
    })();
  }, [router, searchParams]);

  const handleOAuth = async (provider: "google") => {
    setState("loading");
    setErrorMsg("");
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setErrorMsg(error.message);
        setState("error");
      }
    } catch (err) {
      setErrorMsg("OAuth sign-in failed. Try email/password.");
      setState("error");
    }
  };

  const handleLine = () => {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID;
    if (!clientId) {
      setErrorMsg("LINE sign-in is not configured.");
      setState("error");
      return;
    }
    const redirectUri = encodeURIComponent(
      `${window.location.origin}/auth/line/callback`
    );
    const state = Math.random().toString(36).slice(2);
    // Note: 'email' scope requires LINE channel approval — omit it and use
    // the synthetic email fallback (line_<userId>@line.user) in the API route.
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;
  };

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setErrorMsg("Enter your email above, then tap Send magic link.");
      setState("error");
      return;
    }
    setMagicLoading(true);
    setErrorMsg("");
    setMagicLinkSent(false);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
          shouldCreateUser: true,
        },
      });
      if (error) {
        setErrorMsg(error.message || "Could not send magic link.");
        setState("error");
      } else {
        setMagicLinkSent(true);
      }
    } catch (err) {
      setErrorMsg("Could not send magic link. Try again or use a password.");
      setState("error");
    } finally {
      setMagicLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setErrorMsg("Please enter your email.");
      setState("error");
      return;
    }

    if (!password.trim()) {
      setErrorMsg("Please enter your password.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const supabase = getSupabaseBrowser();

      // Sign in with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error || !data.user) {
        setErrorMsg(error?.message ?? "Login failed");
        setState("error");
        return;
      }

      try {
        await fetch("/api/auth/ensure-app-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.user.email,
            supabaseUserId: data.user.id,
          }),
        });
      } catch {
        // Non-fatal
      }

      router.push("/");
    } catch (err) {
      setErrorMsg("An error occurred. Try again.");
      setState("error");
    }
  };

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Ambient glow backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/20 blur-3xl animate-pulse" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} className="mb-3" />
          <h1 className="text-xl font-bold">Financial 101 Master crafted by Toy</h1>
          <p className="text-sm text-muted-foreground mt-1">Personal Financial Planner</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-5 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setErrorMsg("");
                  setMagicLinkSent(false);
                  if (state === "error") setState("idle");
                }}
                required
                autoComplete="email"
                disabled={state === "loading"}
                className="mt-1 w-full h-11 px-3 rounded-xl border border-input bg-background text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setErrorMsg("");
                  if (state === "error") setState("idle");
                }}
                required
                autoComplete="current-password"
                disabled={state === "loading"}
                className="mt-1 w-full h-11 px-3 rounded-xl border border-input bg-background text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
              />
            </div>

            {state === "error" && errorMsg && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}

            {magicLinkSent && (
              <div className="text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg px-3 py-2">
                Magic link sent to <strong>{email.trim()}</strong>. Check your inbox and tap the link to sign in.
              </div>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !email.trim() || !password.trim()}
              className="w-full h-11 bg-primary text-primary-foreground rounded-xl text-sm font-semibold
                hover:bg-primary/90 active:scale-[0.98] transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                shadow-lg shadow-primary/20"
            >
              {state === "loading" ? "Signing in..." : "Sign In"}
            </button>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={magicLoading || state === "loading" || !email.trim()}
              className="w-full h-11 rounded-xl border border-primary/40 bg-primary/5
                         hover:bg-primary/10 text-primary text-sm font-medium
                         flex items-center justify-center gap-2 transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {magicLoading ? "Sending magic link..." : "Email me a magic link"}
            </button>
          </form>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-card px-2 text-muted-foreground">Fast track</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={state === "loading"}
            className="w-full h-11 rounded-xl border border-border bg-background hover:bg-muted
                       text-sm font-medium flex items-center justify-center gap-2 transition-all
                       disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83Z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/>
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleLine}
            disabled={state === "loading"}
            className="w-full h-11 rounded-xl text-white text-sm font-medium
             flex items-center justify-center gap-2 transition-all
             disabled:opacity-50"
            style={{ backgroundColor: "#06C755" }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white" aria-hidden="true">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.628.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            Continue with LINE
          </button>

        </div>
      </div>
    </div>
  );
}
