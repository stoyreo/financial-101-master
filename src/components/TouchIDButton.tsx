"use client";
import { usePasskey } from "@/hooks/usePasskey";

interface Props {
  mode: "login" | "register";
  onSuccess?: () => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function TouchIDButton({ mode, onSuccess, onError, disabled }: Props) {
  const { login, register, loading, isSupported } = usePasskey();

  if (!isSupported) return null;

  const handleClick = async () => {
    const ok = mode === "login" ? await login() : await register();
    if (ok) onSuccess?.();
    else onError?.("Touch ID failed — try another sign-in method.");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={mode === "login" ? "Sign in with Touch ID" : "Set up Touch ID"}
      className="w-full h-11 rounded-xl border border-border bg-background hover:bg-muted
                 text-sm font-medium flex items-center justify-center gap-2 transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Touch ID fingerprint SVG icon */}
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M8.5 8.5C9.33 7.57 10.6 7 12 7c2.76 0 5 2.24 5 5" />
        <path d="M7 12c0-.34.03-.67.09-1" />
        <path d="M12 12v5" />
        <path d="M9 15c0 1.66 1.34 3 3 3" />
        <path d="M16 12c0 1.5-.55 2.87-1.45 3.9" />
        <path d="M12 9c1.66 0 3 1.34 3 3" />
        <path d="M9 12c0-1.66 1.34-3 3-3" />
      </svg>
      {loading
        ? "Verifying…"
        : mode === "login"
        ? "Sign in with Touch ID"
        : "Set up Touch ID"}
    </button>
  );
}
