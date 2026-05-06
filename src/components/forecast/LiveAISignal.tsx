"use client";

/**
 * LIVE AI SIGNAL
 * ──────────────
 * A pulsing, auto-rotating banner that surfaces the highest-priority
 * insight derived from the user's current forecast in real time.
 *
 * "Live" semantics:
 *   1. Insights are computed every render from the (memoised) forecast
 *      rows, so they update the instant the user edits inputs or flips
 *      scenarios.
 *   2. Every 6s we rotate through the ranked list so the user notices
 *      lower-priority items too.
 *   3. A "tick" timestamp re-renders the freshness badge each second so
 *      the banner visibly breathes.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, CheckCircle2, Info, ArrowRight,
  ChevronLeft, ChevronRight, Pause, Play,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { deriveLiveInsights, type LiveInsight, type InsightSeverity } from "@/lib/forecast-insights";

const ROTATION_MS = 6000;

const SEVERITY_STYLES: Record<InsightSeverity, { ring: string; pill: string; icon: any; iconClass: string }> = {
  critical: {
    ring: "ring-red-500/30 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent",
    pill: "bg-red-500/15 text-red-600 dark:text-red-400",
    icon: AlertTriangle,
    iconClass: "text-red-500",
  },
  warning: {
    ring: "ring-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  positive: {
    ring: "ring-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent",
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  info: {
    ring: "ring-sky-500/30 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent",
    pill: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    icon: Info,
    iconClass: "text-sky-500",
  },
};

export function LiveAISignal() {
  const { yearlyForecast, monthlyForecast, profile, scenarios, activeScenarioId } = useStore();
  const scenario = scenarios.find(s => s.id === activeScenarioId) ?? scenarios[0];

  const insights = useMemo<LiveInsight[]>(
    () => deriveLiveInsights({
      yearly: yearlyForecast,
      monthly: monthlyForecast,
      profile,
      scenario,
    }),
    [yearlyForecast, monthlyForecast, profile, scenario]
  );

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  // Reset to first when the underlying list shrinks past current idx.
  useEffect(() => {
    if (idx >= insights.length) setIdx(0);
  }, [insights.length, idx]);

  // Rotation timer.
  useEffect(() => {
    if (paused || insights.length <= 1) return;
    const t = setInterval(() => {
      setIdx(i => (i + 1) % insights.length);
    }, ROTATION_MS);
    return () => clearInterval(t);
  }, [paused, insights.length]);

  // Heartbeat — drives the "x s ago" counter so the badge feels alive.
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity size={14} /> AI signal idle — add income, expenses, and debts to start streaming insights.
        </div>
      </div>
    );
  }

  const current = insights[idx] ?? insights[0];
  const style = SEVERITY_STYLES[current.severity];
  const Icon = style.icon;
  const next = () => setIdx((idx + 1) % insights.length);
  const prev = () => setIdx((idx - 1 + insights.length) % insights.length);

  return (
    <div className={`relative rounded-2xl border ring-1 ${style.ring} p-4 mb-6 overflow-hidden`}>
      {/* Top strip: live indicator + scenario + counter */}
      <div className="flex items-center justify-between mb-3 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
            Live AI signal
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">scenario: {scenario?.name ?? "Base"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground tabular-nums">refresh {tick % ROTATION_MS / 1000 | 0}s</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused(p => !p)}
            className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground"
            aria-label={paused ? "Resume rotation" : "Pause rotation"}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          {insights.length > 1 && (
            <>
              <button onClick={prev} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground" aria-label="Previous insight">
                <ChevronLeft size={12} />
              </button>
              <span className="text-muted-foreground tabular-nums px-1">
                {idx + 1}/{insights.length}
              </span>
              <button onClick={next} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground" aria-label="Next insight">
                <ChevronRight size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 ${style.iconClass}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${style.pill}`}>
              {current.severity}
            </span>
            <h3 className="font-semibold text-sm leading-snug">{current.headline}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{current.detail}</p>

          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            {current.metric && (
              <div className="text-xs">
                <span className="text-muted-foreground">{current.metric.label}: </span>
                <span className="font-semibold tabular-nums">{current.metric.value}</span>
              </div>
            )}
            {current.cta && (
              <Link
                href={current.cta.href}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {current.cta.label} <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar that fills over ROTATION_MS, restarting on each tick */}
      {!paused && insights.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted/30">
          <div
            key={idx}
            className="h-full bg-foreground/30"
            style={{
              animationName: "liveSignalGrow",
              animationDuration: `${ROTATION_MS}ms`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
              width: 0,
            }}
          />
        </div>
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes liveSignalGrow { from { width: 0%; } to { width: 100%; } }`,
        }}
      />
    </div>
  );
}
