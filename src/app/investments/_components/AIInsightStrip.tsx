"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { aiProviderHeaders } from "@/lib/ai-model-pref";

type AIInsightStripProps = {
  trigger: number;                  // bump this to re-fire (use a counter)
  horizonYears: number;
  basePortfolioFinal: number;
  scenarioPortfolioFinal: number;
  deltaByAccount: {
    name: string;
    baseEnd: number;
    scenarioEnd: number;
    returnDelta: number;
  }[];
  presetName: string;
};

type State = "idle" | "loading" | "streaming" | "done" | "error";

export function AIInsightStrip({
  trigger,
  horizonYears,
  basePortfolioFinal,
  scenarioPortfolioFinal,
  deltaByAccount,
  presetName,
}: AIInsightStripProps) {
  const [text, setText] = useState<string>("");
  const [state, setState] = useState<State>("idle");
  const prevTrigger = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Only fire on actual trigger change (after mount)
  useEffect(() => {
    if (trigger === 0 || trigger === prevTrigger.current) return;
    prevTrigger.current = trigger;

    // Same base as scenario — nothing to say
    const delta = scenarioPortfolioFinal - basePortfolioFinal;
    if (Math.abs(delta) < 1000 && deltaByAccount.every(a => Math.abs(a.returnDelta) < 0.001)) {
      setText("");
      setState("idle");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setState("loading");
    setText("");

    (async () => {
      try {
        const res = await fetch("/api/investments/quick-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...aiProviderHeaders() },
          signal,
          body: JSON.stringify({
            horizonYears,
            basePortfolioFinalValue: basePortfolioFinal,
            scenarioPortfolioFinalValue: scenarioPortfolioFinal,
            deltaByAccount,
            presetName,
          }),
        });

        if (!res.ok || !res.body) {
          setState("error");
          return;
        }

        setState("streaming");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setText(accumulated);
        }
        setState("done");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setState("error");
      }
    })();

    return () => abortRef.current?.abort();
  }, [trigger]);

  if (state === "idle") return null;

  return (
    <div className={cn(
      "flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm transition-all",
      state === "error"
        ? "bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400"
        : "bg-violet-50 dark:bg-violet-900/10 text-violet-800 dark:text-violet-300"
    )}>
      {state === "loading" ? (
        <Loader2 size={14} className="shrink-0 mt-0.5 animate-spin text-violet-500" />
      ) : (
        <Sparkles size={14} className="shrink-0 mt-0.5 text-violet-500" />
      )}
      <span className="leading-snug">
        {state === "loading" && <span className="text-muted-foreground italic">Analyzing scenario…</span>}
        {(state === "streaming" || state === "done") && text}
        {state === "error" && "AI insight unavailable — check your API key."}
      </span>
    </div>
  );
}
