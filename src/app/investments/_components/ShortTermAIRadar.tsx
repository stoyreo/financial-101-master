"use client";

/**
 * ShortTermAIRadar — AI-driven 7–14 day US stock scanner.
 *
 * Visual centerpiece of the investments tab:
 *  - Radar sweep loading animation while Claude web-searches the live tape
 *  - Animated Market Pulse gauge (SVG needle + count-up score), AI-driven
 *  - Staggered pick cards with animated confidence bars + expected-move ranges
 *  - Client-side Monte Carlo simulation (300 GBM paths) per pick, rendered as
 *    a percentile fan chart with a 7–14 day horizon slider — no extra API calls
 *
 * ON-DEMAND ONLY: nothing runs until the user clicks Scan. One click = one
 * capped Anthropic call (see /api/investments/short-term-picks).
 * Decision-support only — NOT financial advice; disclaimer rendered below.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import {
  Radar, Loader2, AlertCircle, ExternalLink, TrendingUp, TrendingDown,
  Zap, CalendarClock, ShieldAlert, Sparkles, Pin, PinOff,
} from "lucide-react";
import { loadWatchlist, pinTicker, unpinTicker, WATCHLIST_EVENT, MAX_WATCHLIST } from "./watchlist";
import { cn } from "@/lib/utils";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TokenUsageStamp } from "./TokenUsageStamp";

/* ------------------------------------------------------------------ types */

type Pick = {
  ticker: string;
  company: string;
  sector: string;
  direction: "long" | "avoid" | string;
  thesis: string;
  catalyst: string;
  catalystDate?: string;
  confidence: number;
  expectedMovePct: { low: number; base: number; high: number };
  annualizedVolPct: number;
  riskLevel: "low" | "medium" | "high" | string;
  riskNote: string;
};

type ScanResult = {
  asOf: string;
  horizonDays: number;
  marketPulse: { score: number; label: string; summary: string };
  picks: Pick[];
  watchouts: string[];
  sources: { title: string; url: string }[];
  usage?: { inputTokens: number | null; outputTokens: number | null; webSearches: number; model: string };
};

/* ------------------------------------------------------- monte carlo sim */

/** Deterministic-ish RNG so re-renders don't flicker the fan chart. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number) {
  // Box–Muller
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type FanPoint = {
  day: number;
  band90: [number, number]; // P10–P90
  band50: [number, number]; // P25–P75
  median: number;
};

function simulatePaths(pick: Pick, horizonDays: number, nPaths = 300): { fan: FanPoint[]; probGain: number } {
  const drift = Math.log(1 + pick.expectedMovePct.base / 100) / horizonDays; // daily log-drift
  const dailyVol = pick.annualizedVolPct / 100 / Math.sqrt(252);
  const seed = pick.ticker.split("").reduce((s, c) => s * 31 + c.charCodeAt(0), 7) + horizonDays;
  const rng = mulberry32(seed);

  // paths[p][d] = indexed price (start 100)
  const finals: number[] = [];
  const perDay: number[][] = Array.from({ length: horizonDays + 1 }, () => []);
  for (let p = 0; p < nPaths; p++) {
    let logPrice = Math.log(100);
    perDay[0].push(100);
    for (let d = 1; d <= horizonDays; d++) {
      logPrice += drift - 0.5 * dailyVol * dailyVol + dailyVol * gaussian(rng);
      perDay[d].push(Math.exp(logPrice));
    }
    finals.push(Math.exp(logPrice));
  }

  const pct = (arr: number[], q: number) => {
    const s = [...arr].sort((a, b) => a - b);
    const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
    return s[i];
  };

  const fan: FanPoint[] = perDay.map((vals, day) => ({
    day,
    band90: [pct(vals, 0.1), pct(vals, 0.9)],
    band50: [pct(vals, 0.25), pct(vals, 0.75)],
    median: pct(vals, 0.5),
  }));
  const probGain = finals.filter((f) => f > 100).length / finals.length;
  return { fan, probGain };
}

/* --------------------------------------------------------- count-up hook */

function useCountUp(target: number, durationMs = 1400, active = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, durationMs, active]);
  return value;
}

/* ------------------------------------------------------ market pulse gauge */

function PulseGauge({ score, label }: { score: number; label: string }) {
  const animated = useCountUp(score);
  // score 0..100 → needle angle -90..+90 (deg)
  const angle = (score / 100) * 180 - 90;
  const R = 84;
  const arc = (from: number, to: number) => {
    const a1 = (Math.PI * (180 - from)) / 180;
    const a2 = (Math.PI * (180 - to)) / 180;
    return `M ${100 + R * Math.cos(a1)} ${100 - R * Math.sin(a1)} A ${R} ${R} 0 0 1 ${100 + R * Math.cos(a2)} ${100 - R * Math.sin(a2)}`;
  };
  const zoneColor = score < 35 ? "#ef4444" : score < 65 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-56 max-w-full">
        <defs>
          <linearGradient id="stg-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="stg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* track + gradient arc */}
        <path d={arc(0, 180)} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={14} strokeLinecap="round" />
        <path d={arc(0, 180)} fill="none" stroke="url(#stg-gauge)" strokeWidth={14} strokeLinecap="round" className="stg-arc" />
        {/* tick labels */}
        <text x={16} y={116} fontSize={10} className="fill-red-500">Bearish</text>
        <text x={152} y={116} fontSize={10} className="fill-emerald-500">Bullish</text>
        {/* needle — CSS transition on rotation for the sweep effect */}
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px", transition: "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
          <line x1={100} y1={100} x2={100} y2={28} stroke={zoneColor} strokeWidth={3.5} strokeLinecap="round" filter="url(#stg-glow)" />
          <circle cx={100} cy={100} r={7} fill={zoneColor} filter="url(#stg-glow)" />
        </g>
        <circle cx={100} cy={100} r={3} className="fill-white dark:fill-slate-900" />
      </svg>
      <div className="-mt-3 text-center">
        <div className="text-3xl font-bold tabular-nums" style={{ color: zoneColor }}>{Math.round(animated)}</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ radar loader */

function RadarLoader() {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="relative h-36 w-36">
        {/* pulsing rings */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute inset-0 rounded-full border border-blue-400/40 stg-ping" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
        {/* radar dish grid */}
        <div className="absolute inset-3 rounded-full border border-blue-400/30" />
        <div className="absolute inset-9 rounded-full border border-blue-400/20" />
        <div className="absolute left-1/2 top-3 bottom-3 w-px bg-blue-400/20" />
        <div className="absolute top-1/2 left-3 right-3 h-px bg-blue-400/20" />
        {/* rotating sweep */}
        <div className="absolute inset-3 rounded-full stg-sweep" style={{ background: "conic-gradient(from 0deg, rgba(59,130,246,0.55), rgba(59,130,246,0.08) 70deg, transparent 90deg)" }} />
        {/* blips */}
        <div className="absolute h-1.5 w-1.5 rounded-full bg-emerald-400 stg-blip" style={{ top: "30%", left: "62%" }} />
        <div className="absolute h-1.5 w-1.5 rounded-full bg-emerald-400 stg-blip" style={{ top: "58%", left: "34%", animationDelay: "1.1s" }} />
        <div className="absolute h-1.5 w-1.5 rounded-full bg-amber-400 stg-blip" style={{ top: "44%", left: "50%", animationDelay: "2s" }} />
      </div>
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Claude is scanning the live US tape (momentum, catalysts, earnings)…
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- pick helpers */

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function MoveRangeBar({ move }: { move: Pick["expectedMovePct"] }) {
  // map [-15, +15] % onto the bar
  const span = 15;
  const clamp = (v: number) => Math.max(-span, Math.min(span, v));
  const toPct = (v: number) => ((clamp(v) + span) / (2 * span)) * 100;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-red-400/70 via-slate-300/50 to-emerald-400/70 stg-grow"
          style={{ left: `${toPct(move.low)}%`, width: `${Math.max(2, toPct(move.high) - toPct(move.low))}%` }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 bg-blue-500 shadow" style={{ left: `calc(${toPct(move.base)}% - 6px)` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span className="text-red-500">{move.low.toFixed(1)}%</span>
        <span className="font-semibold text-blue-500">base {move.base >= 0 ? "+" : ""}{move.base.toFixed(1)}%</span>
        <span className="text-emerald-500">+{move.high.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- simulation */

function SimulationPanel({ pick, defaultHorizon, entryPrice }: { pick: Pick; defaultHorizon: number; entryPrice?: number }) {
  const [horizon, setHorizon] = useState(defaultHorizon);
  const { fan, probGain } = useMemo(() => simulatePaths(pick, horizon), [pick, horizon]);
  const last = fan[fan.length - 1];
  // With a live entry price the chart speaks in dollars; otherwise indexed %.
  const hasPx = typeof entryPrice === "number" && entryPrice > 0;
  const toUsd = (idx: number) => (entryPrice as number) * (idx / 100);
  const fmt = (v: number) => `${(v - 100) >= 0 ? "+" : ""}${(v - 100).toFixed(1)}%`;
  const fmtFull = (v: number) => (hasPx ? `$${toUsd(v).toFixed(2)} (${fmt(v)})` : fmt(v));
  const stopPrice = hasPx ? toUsd(100 + pick.expectedMovePct.low) : null;

  return (
    <div className="stg-enter rounded-xl border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/60 to-violet-50/40 dark:from-blue-950/30 dark:to-violet-950/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-500" />
          <span className="font-semibold text-sm">AI Simulation Gauge — {pick.ticker}</span>
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">300 Monte Carlo paths</Badge>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Horizon
          <input
            type="range" min={7} max={14} step={1} value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="accent-violet-500"
          />
          <span className="font-semibold tabular-nums text-foreground">{horizon}d</span>
        </label>
      </div>

      <div className={cn("grid gap-2 mb-3 text-center", hasPx ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3")}>
        {hasPx && (
          <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entry</div>
            <div className="text-lg font-bold tabular-nums">${(entryPrice as number).toFixed(2)}</div>
          </div>
        )}
        <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">P(gain)</div>
          <div className={cn("text-lg font-bold tabular-nums", probGain >= 0.5 ? "text-emerald-500" : "text-red-500")}>{Math.round(probGain * 100)}%</div>
        </div>
        <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Median</div>
          <div className="text-lg font-bold tabular-nums text-blue-500">{hasPx ? `$${toUsd(last.median).toFixed(2)}` : fmt(last.median)}</div>
          {hasPx && <div className="text-[10px] tabular-nums text-muted-foreground">{fmt(last.median)}</div>}
        </div>
        <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">P10 / P90</div>
          <div className="text-sm font-semibold tabular-nums pt-1">
            <span className="text-red-500">{hasPx ? `$${toUsd(last.band90[0]).toFixed(0)}` : fmt(last.band90[0])}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-emerald-500">{hasPx ? `$${toUsd(last.band90[1]).toFixed(0)}` : fmt(last.band90[1])}</span>
          </div>
        </div>
        {stopPrice !== null && (
          <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested stop</div>
            <div className="text-lg font-bold tabular-nums text-red-500">${stopPrice.toFixed(2)}</div>
            <div className="text-[10px] tabular-nums text-muted-foreground">{pick.expectedMovePct.low.toFixed(1)}%</div>
          </div>
        )}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={fan} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="stg-band90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.18} />
              </linearGradient>
              <linearGradient id="stg-band50" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => `D${d}`} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v: number) => (hasPx ? `$${toUsd(v).toFixed(0)}` : `${(v - 100).toFixed(0)}%`)} />
            <Tooltip
              formatter={(value: any, name: string) => {
                if (Array.isArray(value)) return [`${fmtFull(value[0])} … ${fmtFull(value[1])}`, name === "band90" ? "P10–P90" : "P25–P75"];
                return [fmtFull(value as number), "Median"];
              }}
              labelFormatter={(d) => `Trading day ${d}`}
            />
            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="band90" stroke="none" fill="url(#stg-band90)" animationDuration={900} />
            <Area type="monotone" dataKey="band50" stroke="none" fill="url(#stg-band50)" animationDuration={900} />
            <Line type="monotone" dataKey="median" stroke="#6366f1" strokeWidth={2.5} dot={false} animationDuration={1200} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Simulated from the AI&apos;s expected move ({pick.expectedMovePct.base >= 0 ? "+" : ""}{pick.expectedMovePct.base}% base) and ~{pick.annualizedVolPct}% annualized volatility. Indexed to 100 at day 0.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ main */

// Per-day scan cache (sessionStorage, per-user) — a page revisit re-shows the
// last scan instead of tempting a duplicate token-burning click.
const scanCacheKey = (userId: string) => `f101:investments:radar-scan:${userId}`;

export function ShortTermAIRadar({ userId = "", riskProfile = "moderate" }: { userId?: string; riskProfile?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  // Hydrate today's cached scan on mount (upgrade #5).
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = sessionStorage.getItem(scanCacheKey(userId));
      if (!raw) return;
      const cached = JSON.parse(raw);
      if (cached?.result?.picks?.length) {
        setResult(cached.result);
        setPrices(cached.prices ?? {});
        setCachedAt(cached.cachedAt ?? null);
        const firstLong = (cached.result as ScanResult).picks.find((p) => p.direction === "long");
        setSelected(firstLong?.ticker ?? cached.result.picks[0]?.ticker ?? null);
      }
    } catch { /* corrupt cache — ignore */ }
  }, [userId]);

  /** Fetch live quotes for the scan's tickers (upgrade #4 — real $ levels). */
  const fetchPrices = useCallback(async (tickers: string[]): Promise<Record<string, number>> => {
    try {
      const res = await fetch("/api/investments/watchlist-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const q of data.quotes ?? []) map[q.ticker] = q.price;
      return map;
    } catch {
      return {};
    }
  }, []);

  // Keep the pin-button state in sync with the watchlist (per-user sessionStorage).
  useEffect(() => {
    const sync = () => setPinned(new Set(loadWatchlist(userId).map((w) => w.ticker)));
    sync();
    window.addEventListener(WATCHLIST_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_EVENT, sync);
  }, [userId]);

  const togglePin = useCallback((p: Pick) => {
    if (!userId) return;
    if (pinned.has(p.ticker)) {
      unpinTicker(userId, p.ticker);
    } else {
      pinTicker(userId, p.ticker, {
        company: p.company,
        catalyst: p.catalyst,
        catalystDate: p.catalystDate || undefined,
        direction: p.direction,
        confidence: p.confidence,
        // Band + entry reference so the LINE alert cron can watch this pick.
        expectedLowPct: p.expectedMovePct.low,
        expectedHighPct: p.expectedMovePct.high,
        entryPrice: prices[p.ticker],
      });
    }
  }, [userId, pinned, prices]);

  // ON-DEMAND ONLY: one deliberate click = one capped Anthropic call.
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    try {
      const res = await fetch("/api/investments/short-term-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskProfile, horizonDays: 10 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "AI scan failed. Please try again.");
        return;
      }
      const scan = data as ScanResult;
      setResult(scan);
      const firstLong = scan.picks?.find((p) => p.direction === "long");
      setSelected(firstLong?.ticker ?? scan.picks?.[0]?.ticker ?? null);

      // Upgrade #4: real dollar levels for the simulation panel.
      const px = await fetchPrices(scan.picks.map((p) => p.ticker));
      setPrices(px);

      // Upgrade #5: cache today's scan so revisits don't burn tokens.
      const now = new Date().toISOString();
      setCachedAt(now);
      if (userId) {
        try {
          sessionStorage.setItem(scanCacheKey(userId), JSON.stringify({ result: scan, prices: px, cachedAt: now }));
        } catch { /* full — ignore */ }
      }

      // Upgrade #3: log the scan server-side for the calibration scorecard.
      fetch("/api/investments/radar-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appendScan: {
            id: `scan-${Date.now()}`,
            asOf: scan.asOf || now.slice(0, 10),
            horizonDays: scan.horizonDays || 10,
            picks: scan.picks.map((p) => ({
              ticker: p.ticker,
              direction: p.direction,
              base: p.expectedMovePct.base,
              low: p.expectedMovePct.low,
              high: p.expectedMovePct.high,
              confidence: p.confidence,
              refPrice: px[p.ticker],
            })),
          },
        }),
      }).catch(() => { /* fire-and-forget */ });
    } catch {
      setError("Network error — could not reach the AI scan endpoint.");
    } finally {
      setLoading(false);
    }
  }, [riskProfile, userId, fetchPrices]);

  const selectedPick = result?.picks.find((p) => p.ticker === selected) ?? null;

  return (
    <Card className="relative overflow-hidden mb-6">
      {/* animated aurora border glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/15 via-violet-500/15 to-emerald-500/10 blur-3xl stg-float" />
      <style>{`
        @keyframes stg-sweep-rot { to { transform: rotate(360deg); } }
        .stg-sweep { animation: stg-sweep-rot 2.2s linear infinite; }
        @keyframes stg-ping-kf { 0% { transform: scale(0.5); opacity: 0.8; } 100% { transform: scale(1.15); opacity: 0; } }
        .stg-ping { animation: stg-ping-kf 1.8s ease-out infinite; }
        @keyframes stg-blip-kf { 0%, 100% { opacity: 0.1; } 12% { opacity: 1; } 40% { opacity: 0.3; } }
        .stg-blip { animation: stg-blip-kf 2.2s ease-in-out infinite; }
        @keyframes stg-enter-kf { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .stg-enter { animation: stg-enter-kf 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes stg-fill-kf { from { width: 0; } }
        .stg-fill { animation: stg-fill-kf 1.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes stg-grow-kf { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .stg-grow { transform-origin: center; animation: stg-grow-kf 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes stg-float-kf { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-18px, 14px); } }
        .stg-float { animation: stg-float-kf 9s ease-in-out infinite; }
        @keyframes stg-shimmer-kf { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .stg-shimmer { background-size: 200% 100%; animation: stg-shimmer-kf 3.5s linear infinite; }
      `}</style>

      <CardHeader className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-violet-500/30">
              <Radar className="h-5 w-5" />
            </span>
            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-clip-text text-transparent stg-shimmer">
              AI Short-Term Radar — US Stocks
            </span>
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">7–14 days</Badge>
            {cachedAt && !loading && (
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                cached {new Date(cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Badge>
            )}
          </CardTitle>
          <Button onClick={run} disabled={loading} className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-violet-500/25">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {loading ? "Scanning…" : result ? "Re-scan the tape" : "Scan the market"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Claude live-searches S&amp;P 500 momentum, catalysts and earnings dates, scores the tape, and hands its expected-move estimates to an on-device Monte Carlo simulator. On-demand only — one click, one capped API call.
        </p>
      </CardHeader>

      <CardContent className="relative space-y-5">
        {loading && <RadarLoader />}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !result && !error && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Hit <span className="font-semibold text-foreground">Scan the market</span> to get today&apos;s AI-ranked short-term candidates with a live market-pulse gauge and per-stock simulations.
          </div>
        )}

        {result && !loading && (
          <>
            {/* pulse gauge + tape summary */}
            <div className="stg-enter grid gap-4 md:grid-cols-[auto_1fr] items-center rounded-xl border border-border bg-gradient-to-br from-slate-50/80 to-blue-50/40 dark:from-slate-900/40 dark:to-blue-950/20 p-4">
              <PulseGauge score={result.marketPulse.score} label={result.marketPulse.label} />
              <div>
                <div className="text-sm font-semibold mb-1 flex items-center gap-2">
                  Market Pulse <span className="text-xs font-normal text-muted-foreground">as of {result.asOf}</span>
                </div>
                <p className="text-sm text-muted-foreground">{result.marketPulse.summary}</p>
                {result.watchouts?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.watchouts.map((w, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/40 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                        <ShieldAlert className="h-3 w-3" /> {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* pick cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {result.picks.map((p, i) => {
                const isSel = p.ticker === selected;
                const long = p.direction !== "avoid";
                const isPinned = pinned.has(p.ticker);
                return (
                  <div
                    key={p.ticker}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(p.ticker)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(p.ticker); }}
                    style={{ animationDelay: `${i * 110}ms` }}
                    className={cn(
                      "stg-enter cursor-pointer text-left rounded-xl border p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                      isSel
                        ? "border-violet-400 dark:border-violet-600 ring-2 ring-violet-400/30 shadow-lg shadow-violet-500/10 bg-violet-50/40 dark:bg-violet-950/20"
                        : "border-border bg-card hover:border-violet-300/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-base">{p.ticker}</span>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          long ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                          {long ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {long ? "LONG" : "AVOID"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={RISK_COLORS[p.riskLevel] ?? RISK_COLORS.medium}>{p.riskLevel} risk</Badge>
                        {userId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePin(p); }}
                            title={isPinned ? `Unpin ${p.ticker} from watchlist` : `Pin ${p.ticker} to short-term watchlist (max ${MAX_WATCHLIST})`}
                            className={cn(
                              "p-1.5 rounded-lg transition-all duration-200",
                              isPinned
                                ? "text-violet-500 bg-violet-100 dark:bg-violet-900/40 rotate-0"
                                : "text-muted-foreground hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40 -rotate-12 hover:rotate-0",
                            )}
                          >
                            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.company} · {p.sector}</div>

                    {/* confidence bar */}
                    <div className="mt-2.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>AI conviction</span>
                        <span className="font-semibold tabular-nums text-foreground">{Math.round(p.confidence)}/100</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full stg-fill bg-gradient-to-r", p.confidence >= 65 ? "from-emerald-400 to-emerald-500" : p.confidence >= 45 ? "from-amber-400 to-amber-500" : "from-red-400 to-red-500")}
                          style={{ width: `${p.confidence}%`, animationDelay: `${300 + i * 110}ms` }}
                        />
                      </div>
                    </div>

                    <MoveRangeBar move={p.expectedMovePct} />

                    <p className="text-xs mt-2.5 leading-relaxed">{p.thesis}</p>
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-blue-600 dark:text-blue-400">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 mt-px" />
                      <span>{p.catalyst}{p.catalystDate ? ` (${p.catalystDate})` : ""}</span>
                    </div>
                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                      <span>{p.riskNote}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI-driven Monte Carlo simulation gauge for the selected pick */}
            {selectedPick && (
              <SimulationPanel
                key={selectedPick.ticker}
                pick={selectedPick}
                defaultHorizon={result.horizonDays || 10}
                entryPrice={prices[selectedPick.ticker]}
              />
            )}

            {/* sources */}
            {result.sources?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold">Sources: </span>
                {result.sources.slice(0, 6).map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-500 hover:underline mr-3">
                    {s.title.length > 40 ? s.title.slice(0, 40) + "…" : s.title} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}

            <TokenUsageStamp
              inputTokens={result.usage?.inputTokens ?? null}
              outputTokens={result.usage?.outputTokens ?? null}
              remainingTokens={null}
              tokenLimit={null}
            />
          </>
        )}

        <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
          ⚠️ AI-generated decision support, not financial advice. Short-horizon (7–14 day) stock moves are dominated by noise — even a well-researched setup is close to a coin flip. Position sizes should assume the P10 outcome can happen.
        </p>
      </CardContent>
    </Card>
  );
}
