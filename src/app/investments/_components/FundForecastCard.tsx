"use client";
import { useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { Sparkles, Loader2, RefreshCw, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { cn, pct } from "@/lib/utils";
import type { FundInfo } from "@/lib/fund-registry";
import { ForecastCollapse } from "./ForecastCollapse";
import { TokenUsageStamp } from "./TokenUsageStamp";
import { aiProviderHeaders } from "@/lib/ai-model-pref";
import ModelPicker from "@/components/ai/ModelPicker";

// ── Generic AI Return Forecast card ───────────────────────────────────────────
// Works for ANY fund in the registry (built-in example funds or a user's own
// custom-added fund) — replaces the old PVDForecastCard / SCBGOLDHRMFForecastCard
// pair, which were hardcoded to two specific SCB fund codes. The fund itself is
// passed in as a prop, so this card has no knowledge of any particular fund.

// ── Types ─────────────────────────────────────────────────────────────────────

interface Forecast {
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
  fund: FundInfo;
  /** Called when user clicks "Apply" — passes the AI estimated return */
  onApply?: (estimatedReturn: number) => void;
  /** Whether any matching accounts exist in the portfolio for this fund */
  hasMatchingAccounts?: boolean;
}

// Theme accent per asset class, purely cosmetic (was hardcoded violet for PVD,
// yellow for gold RMF — generalised to any fund's asset class).
const THEME: Record<string, { border: string; text: string; bg: string; accentBg: string; dot: string }> = {
  thai_equity: { border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/10", accentBg: "bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-800/50", dot: "bg-violet-400" },
  gold: { border: "border-yellow-200 dark:border-yellow-800", text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/10", accentBg: "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-800/50", dot: "bg-yellow-500" },
  bond: { border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/10", accentBg: "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50", dot: "bg-blue-400" },
  mixed: { border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/10", accentBg: "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50", dot: "bg-emerald-400" },
  other: { border: "border-slate-200 dark:border-slate-800", text: "text-slate-700 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900/10", accentBg: "bg-slate-50 dark:bg-slate-900/10 border-slate-100 dark:border-slate-800/50", dot: "bg-slate-400" },
};

function cacheKey(fundCode: string): string {
  return `f101:fund-forecast:${fundCode}:v1`;
}

function readCache(fundCode: string): { asOf: string; data: Forecast } | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(fundCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.asOf !== new Date().toISOString().slice(0, 10)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(fundCode: string, data: Forecast): void {
  try {
    sessionStorage.setItem(
      cacheKey(fundCode),
      JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), data }),
    );
  } catch { /* quota exceeded — ignore */ }
}

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

function ConfidenceBand({ low, mid, high, dot }: { low: number; mid: number; high: number; dot: string }) {
  const rangeW = high - low;
  const midPct = rangeW > 0 ? ((mid - low) / rangeW) * 100 : 50;

  return (
    <div className="relative mt-3">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Conservative {pct(low)}</span>
        <span className="font-semibold text-foreground">Best estimate {pct(mid)}</span>
        <span>Optimistic {pct(high)}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-amber-200 via-emerald-300 to-emerald-500 dark:from-amber-900/60 dark:via-emerald-700/60 dark:to-emerald-500/70">
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 shadow-md", dot.replace("bg-", "border-"))}
          style={{ left: `calc(${midPct}% - 8px)` }}
          title={`Best estimate: ${pct(mid)}`}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FundForecastCard({ fund, onApply, hasMatchingAccounts = false }: Props) {
  const theme = THEME[fund.assetClass] ?? THEME.other;
  const hasHistory = fund.annualReturns.length > 0;
  const years = fund.annualReturns.length;
  const yearRange = hasHistory
    ? `${fund.annualReturns[0].yearCE}–${fund.annualReturns[fund.annualReturns.length - 1].yearCE}`
    : null;

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [applied, setApplied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = readCache(fund.code);
    if (cached) {
      setForecast(cached.data);
      setStatus("done");
    }
  }, [fund.code]);

  const fetchForecast = () => {
    setStatus("loading");
    fetch("/api/investments/fund-forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...aiProviderHeaders() },
      body: JSON.stringify({ fund }),
    })
      .then(r => r.json())
      .then((data: Forecast) => {
        setForecast(data);
        setStatus("done");
        writeCache(fund.code, data);
      })
      .catch(() => setStatus("error"));
  };

  const handleRefresh = () => {
    try { sessionStorage.removeItem(cacheKey(fund.code)); } catch { /* ignore */ }
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

  const chartData = fund.annualReturns.map(r => ({
    year: String(r.yearCE),
    fund: r.fund,
    benchmark: r.benchmark,
  }));

  return (
    <Card className={cn("mb-6", theme.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className={theme.text} />
            <CardTitle className="text-sm">
              AI Return Forecast — {fund.nameEN}
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              {fund.code}
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
          {fund.nameTH ? `${fund.nameTH} — ` : ""}{fund.manager}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">

        {status === "idle" && (
          <div className="flex flex-col items-center gap-2.5 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Get an AI-generated return estimate for {fund.code}
              {hasHistory ? ` based on ${years} years of fund history.` : "."}
            </p>
            <div className="flex items-center gap-2">
              <ModelPicker />
              <Button size="sm" onClick={fetchForecast}>
                <Sparkles size={13} />
                Generate AI forecast
              </Button>
            </div>
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2.5 py-6 justify-center text-muted-foreground text-sm">
            <Loader2 size={16} className={cn("animate-spin", theme.text)} />
            <span>Analysing {fund.code}…</span>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Could not reach AI service. Try refreshing.</span>
          </div>
        )}

        {status === "done" && forecast && (
          <ForecastCollapse
            storageId={`f101:fund-forecast:${fund.code}:collapsed`}
            defaultExpanded={false}
            summary={
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    AI Best-Estimate
                  </div>
                  <div className={cn("text-3xl font-bold tabular-nums", theme.text)}>
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
                <div className={cn("rounded-xl p-4 border", theme.accentBg)}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        AI Best-Estimate Annual Return
                      </div>
                      <div className={cn("text-4xl font-bold tabular-nums", theme.text)}>
                        {pct(forecast.estimatedReturn)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Range: {pct(forecast.low)} – {pct(forecast.high)}
                      </div>
                    </div>
                    {hasHistory && (
                      <div className="flex gap-6 text-center">
                        <ReturnBadge
                          value={(fund.annualReturns[fund.annualReturns.length - 1]?.fund ?? 0) / 100}
                          label={`Last year (${fund.annualReturns[fund.annualReturns.length - 1]?.yearCE})`}
                        />
                        <ReturnBadge
                          value={(fund.annualReturns.reduce((s, r) => s + r.fund, 0) / fund.annualReturns.length) / 100}
                          label={`${years}yr avg`}
                        />
                      </div>
                    )}
                  </div>
                  <ConfidenceBand
                    low={forecast.low}
                    mid={forecast.estimatedReturn}
                    high={forecast.high}
                    dot={theme.dot}
                  />
                </div>

                <div className="text-sm text-muted-foreground leading-relaxed">
                  {forecast.explanation}
                </div>

                <div className="flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-blue-800 dark:text-blue-300">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <span>{forecast.vsOldDefault}</span>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Key Factors</div>
                  <ul className="space-y-1.5">
                    {forecast.keyFactors.map((factor, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", theme.dot)} />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {hasHistory && (
                  <div>
                    <button
                      onClick={() => setShowHistory(h => !h)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>{showHistory ? "Hide" : "Show"} {years}-year performance ({yearRange})</span>
                      <span className="text-xs">{showHistory ? "▲" : "▼"}</span>
                    </button>

                    {showHistory && (
                      <div className="mt-3">
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={chartData} barGap={2} barSize={14}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                            <Tooltip
                              formatter={(v: number, name: string) => [
                                `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                                name === "fund" ? fund.code : fund.benchmark,
                              ]}
                            />
                            <ReferenceLine y={0} stroke="#888" strokeWidth={1} />
                            <ReferenceLine
                              y={forecast.estimatedReturn * 100}
                              stroke="#7c3aed"
                              strokeDasharray="4 2"
                              label={{ value: "AI est.", position: "insideTopRight", fontSize: 10, fill: "#7c3aed" }}
                            />
                            <Bar dataKey="fund" name="fund" radius={[2, 2, 0, 0]}>
                              {chartData.map((d, i) => (
                                <Cell key={i} fill={d.fund >= 0 ? "#10b981" : "#ef4444"} />
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
                            <span className="w-8 border-t-2 border-dashed border-violet-500 inline-block" /> AI estimate
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Std dev: {fund.stdDevPct}% p.a. · Tracking error: {fund.trackingErrorPct}% p.a. · TER: {fund.totalExpenseRatioPct}% p.a.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic">
                  Methodology: {forecast.methodology}
                </p>

                <TokenUsageStamp
                  inputTokens={forecast.usage.inputTokens}
                  outputTokens={forecast.usage.outputTokens}
                  remainingTokens={forecast.usage.remainingTokens}
                  tokenLimit={forecast.usage.tokenLimit}
                />

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
                            ? `Apply ${pct(forecast.estimatedReturn)} to ${fund.code} accounts`
                            : `Use ${pct(forecast.estimatedReturn)} as default for new ${fund.code}`}
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Updates expected return on all active accounts linked to {fund.code}
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
