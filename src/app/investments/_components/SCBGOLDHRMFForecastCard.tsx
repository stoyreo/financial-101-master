"use client";
import { useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { Sparkles, Loader2, RefreshCw, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { cn, pct } from "@/lib/utils";
import { SCBGOLDHRMF } from "@/lib/fund-registry";
import { ForecastCollapse } from "./ForecastCollapse";
import { TokenUsageStamp } from "./TokenUsageStamp";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SCBGoldForecast {
  asOf: string;
  fundCode: string;
  estimatedReturn: number;
  low: number;
  high: number;
  explanation: string;
  keyFactors: string[];
  methodology: string;
  vsOldDefault: string;
  source: "ai" | "fallback" | string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    remainingTokens: number | null;
    tokenLimit: number | null;
  };
}

interface Props {
  /** Called when user clicks "Apply" — passes the AI estimated return */
  onApply?: (estimatedReturn: number) => void;
  /** Whether any matching gold RMF accounts exist in the portfolio */
  hasMatchingAccounts?: boolean;
}

// ── Cache key (sessionStorage, cleared on logout) ─────────────────────────────
const CACHE_KEY = "f101:scbgoldhrmf-forecast:v1";

function readCache(): { asOf: string; data: SCBGoldForecast } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire after 24 hours
    if (parsed.asOf !== new Date().toISOString().slice(0, 10)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: SCBGoldForecast): void {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), data }),
    );
  } catch { /* quota exceeded — ignore */ }
}

// ── Historical chart data ─────────────────────────────────────────────────────

const CHART_DATA = SCBGOLDHRMF.annualReturns.map(r => ({
  year: String(r.yearCE),
  fund: r.fund,
  benchmark: r.benchmark,
}));

// ── Sub-components ────────────────────────────────────────────────────────────

function ReturnBadge({ value, label }: { value: number; label: string }) {
  const isPositive = value >= 0;
  return (
    <div className="text-center">
      <div className={cn(
        "text-2xl font-bold tabular-nums",
        isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
      )}>
        {value >= 0 ? "+" : ""}{pct(value)}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ConfidenceBand({ low, mid, high }: { low: number; mid: number; high: number }) {
  const rangeW = high - low;
  const midPct = rangeW > 0 ? ((mid - low) / rangeW) * 100 : 50;

  return (
    <div className="relative mt-3">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Conservative {pct(low)}</span>
        <span className="font-semibold text-foreground">Best estimate {pct(mid)}</span>
        <span>Optimistic {pct(high)}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-amber-200 via-yellow-300 to-yellow-500 dark:from-amber-900/60 dark:via-yellow-700/60 dark:to-yellow-500/70">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-yellow-600 shadow-md"
          style={{ left: `calc(${midPct}% - 8px)` }}
          title={`Best estimate: ${pct(mid)}`}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SCBGOLDHRMFForecastCard({ onApply, hasMatchingAccounts = false }: Props) {
  const [forecast, setForecast] = useState<SCBGoldForecast | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [applied, setApplied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fetchedRef = useRef(false);

  // On mount: only check cache. Do NOT auto-fetch from the AI on startup —
  // fetching is now gated behind the "Generate AI forecast" button.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = readCache();
    if (cached) {
      setForecast(cached.data);
      setStatus("done");
    }
  }, []);

  const fetchForecast = () => {
    setStatus("loading");
    fetch("/api/investments/scbgoldhrmf-forecast", { method: "POST" })
      .then(r => r.json())
      .then((data: SCBGoldForecast) => {
        setForecast(data);
        setStatus("done");
        writeCache(data);
      })
      .catch(() => setStatus("error"));
  };

  const handleRefresh = () => {
    try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    setForecast(null);
    setApplied(false);
    fetchForecast();
  };

  const handleApply = () => {
    if (!forecast || !onApply) return;
    onApply(forecast.estimatedReturn);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <Card className="mb-6 border-yellow-200 dark:border-yellow-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-yellow-600 dark:text-yellow-400" />
            <CardTitle className="text-sm">
              AI Return Forecast — SCBGOLDHRMF
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              SCBGOLDHRMF
            </Badge>
            {forecast?.source === "ai" && (
              <Badge variant="success" className="text-xs">AI-powered</Badge>
            )}
            {forecast?.source?.startsWith("fallback") && (
              <Badge variant="warning" className="text-xs">Estimate</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {forecast && (
              <span className="text-xs text-muted-foreground">
                Updated {forecast.asOf}
              </span>
            )}
            {status !== "idle" && (
              <button
                onClick={handleRefresh}
                disabled={status === "loading"}
                className="p-1.5 hover:bg-accent rounded-md transition-colors disabled:opacity-40"
                title="Refresh AI forecast"
              >
                <RefreshCw size={13} className={cn(status === "loading" && "animate-spin")} />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {SCBGOLDHRMF.nameTH} — {SCBGOLDHRMF.manager}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">

        {/* Idle state — forecast not yet requested */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-2.5 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Get an AI-generated return estimate for SCBGOLDHRMF based on 11 years of fund history.
            </p>
            <Button size="sm" onClick={fetchForecast}>
              <Sparkles size={13} />
              Generate AI forecast
            </Button>
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex items-center gap-2.5 py-6 justify-center text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin text-yellow-600" />
            <span>Analysing 11 years of SCBGOLDHRMF returns…</span>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Could not reach AI service. Try refreshing.</span>
          </div>
        )}

        {/* Done state */}
        {status === "done" && forecast && (
          <ForecastCollapse
            storageId="f101:scbgoldhrmf-forecast:expanded"
            defaultExpanded={false}
            summary={
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    AI Best-Estimate
                  </div>
                  <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">
                    {pct(forecast.estimatedReturn)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Range: {pct(forecast.low)} – {pct(forecast.high)}
                </div>
              </div>
            }
            children={
              <>
                {/* ── Main return estimate ────────────────────────────────────── */}
                <div className="rounded-xl bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/50 p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        AI Best-Estimate Annual Return
                      </div>
                      <div className="text-4xl font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">
                        {pct(forecast.estimatedReturn)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Range: {pct(forecast.low)} – {pct(forecast.high)}
                      </div>
                    </div>
                    <div className="flex gap-6 text-center">
                      <ReturnBadge
                        value={(SCBGOLDHRMF.annualReturns.find(r => r.yearCE === 2025)?.fund ?? 0) / 100}
                        label="Last year (2025)"
                      />
                      <ReturnBadge
                        value={(SCBGOLDHRMF.annualReturns.reduce((s, r) => s + r.fund, 0) / SCBGOLDHRMF.annualReturns.length) / 100}
                        label="11yr avg"
                      />
                    </div>
                  </div>
                  <ConfidenceBand
                    low={forecast.low}
                    mid={forecast.estimatedReturn}
                    high={forecast.high}
                  />
                </div>

                {/* ── Explanation ────────────────────────────────────────────── */}
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {forecast.explanation}
                </div>

                {/* ── vs Old default ──────────────────────────────────────────── */}
                <div className="flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-blue-800 dark:text-blue-300">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <span>{forecast.vsOldDefault}</span>
                </div>

                {/* ── Key factors ────────────────────────────────────────────── */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Key Factors</div>
                  <ul className="space-y-1.5">
                    {forecast.keyFactors.map((factor, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* ── Historical performance chart (collapsible) ──────────────── */}
                <div>
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>{showHistory ? "Hide" : "Show"} 11-year performance (2015–2025)</span>
                    <span className="text-xs">{showHistory ? "▲" : "▼"}</span>
                  </button>

                  {showHistory && (
                    <div className="mt-3">
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={CHART_DATA} barGap={2} barSize={14}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[-20, 35]} />
                          <Tooltip
                            formatter={(v: number, name: string) => [
                              `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                              name === "fund" ? "Gold (THB-hedged)" : "Benchmark",
                            ]}
                          />
                          <ReferenceLine y={0} stroke="#888" strokeWidth={1} />
                          <ReferenceLine
                            y={forecast.estimatedReturn * 100}
                            stroke="#eab308"
                            strokeDasharray="4 2"
                            label={{ value: "AI est.", position: "insideTopRight", fontSize: 10, fill: "#eab308" }}
                          />
                          <Bar dataKey="fund" name="fund" radius={[2, 2, 0, 0]}>
                            {CHART_DATA.map((d, i) => (
                              <Cell
                                key={i}
                                fill={d.fund >= 0 ? "#10b981" : "#ef4444"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Positive year
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Negative year
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-8 border-t-2 border-dashed border-yellow-500 inline-block" /> AI estimate
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Std dev: {SCBGOLDHRMF.stdDevPct}% p.a. · Tracking error: {SCBGOLDHRMF.trackingErrorPct}% p.a. · TER: {SCBGOLDHRMF.totalExpenseRatioPct}% p.a.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Methodology ────────────────────────────────────────────── */}
                <p className="text-xs text-muted-foreground italic">
                  Methodology: {forecast.methodology}
                </p>

                {/* ── Token usage ─────────────────────────────────────────────── */}
                <TokenUsageStamp
                  inputTokens={forecast.usage.inputTokens}
                  outputTokens={forecast.usage.outputTokens}
                  remainingTokens={forecast.usage.remainingTokens}
                  tokenLimit={forecast.usage.tokenLimit}
                />

                {/* ── Apply button ────────────────────────────────────────────── */}
                {onApply && (
                  <div className="flex items-center gap-3 pt-1 border-t border-border">
                    <Button
                      size="sm"
                      variant={applied ? "outline" : "default"}
                      onClick={handleApply}
                      disabled={applied}
                      className={cn(applied && "text-emerald-600 border-emerald-400")}
                    >
                      {applied ? (
                        <>
                          <CheckCircle size={13} className="text-emerald-500" />
                          Applied — {pct(forecast.estimatedReturn)} set
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          {hasMatchingAccounts
                            ? `Apply ${pct(forecast.estimatedReturn)} to gold RMF accounts`
                            : `Use ${pct(forecast.estimatedReturn)} as default for new gold RMF`}
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Updates expected return on all active gold RMF accounts
                    </span>
                  </div>
                )}
              </>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
