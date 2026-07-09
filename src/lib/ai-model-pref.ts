"use client";

/**
 * Shared, client-side "which AI model should answer?" preference.
 *
 * Every AI trigger button in the app renders a <ModelPicker /> next to it
 * (src/components/ai/ModelPicker.tsx). The choice is stored ONCE here so all
 * pickers stay in sync, persisted in sessionStorage (cleared on tab close —
 * consistent with the app's storage policy), and sent to the server as an
 * `x-ai-provider` header which src/lib/ai-provider.ts `requestedProvider()`
 * turns into a per-request provider override.
 *
 * "auto" (default) keeps the server's normal fallback order:
 * Gemini (free) → Ollama (local) → Claude.
 */

import { useSyncExternalStore } from "react";

export type AiModelPref = "auto" | "ollama" | "gemini" | "claude";

const KEY = "ai-model-pref-v1";
const EVENT = "ai-model-pref-changed";

export function getAiModelPref(): AiModelPref {
  if (typeof window === "undefined") return "auto";
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "ollama" || v === "gemini" || v === "claude" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setAiModelPref(pref: AiModelPref): void {
  try {
    if (pref === "auto") sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable — non-fatal */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** React hook — re-renders when any ModelPicker changes the shared pref. */
export function useAiModelPref(): [AiModelPref, (p: AiModelPref) => void] {
  const pref = useSyncExternalStore(subscribe, getAiModelPref, () => "auto" as AiModelPref);
  return [pref, setAiModelPref];
}

/**
 * Headers to spread into every AI fetch call:
 *   fetch("/api/...", { headers: { "content-type": "application/json", ...aiProviderHeaders() } })
 * Empty object when the pref is "auto" so server-side defaults apply.
 */
export function aiProviderHeaders(): Record<string, string> {
  const pref = getAiModelPref();
  return pref === "auto" ? {} : { "x-ai-provider": pref };
}
