"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

interface AiStatusState {
  available: boolean;
  loading: boolean;
  reason?: string;
}

const AiStatusContext = createContext<AiStatusState>({
  available: true,
  loading: true,
});

const POLL_INTERVAL_MS = 10 * 60 * 1000;

export function AiStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AiStatusState>({
    available: true,
    loading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status", {
        next: { revalidate: 300 },
        cache: "default",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { available: boolean; reason?: string };
      setState({ available: data.available, loading: false, reason: data.reason });
    } catch {
      setState({ available: true, loading: false });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <AiStatusContext.Provider value={state}>
      {children}
    </AiStatusContext.Provider>
  );
}

export function useAiStatus(): AiStatusState {
  return useContext(AiStatusContext);
}

export async function isAiAvailable(): Promise<boolean> {
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/ai/status`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { available: boolean };
    return data.available;
  } catch {
    return true;
  }
}
