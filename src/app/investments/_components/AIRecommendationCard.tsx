"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { cn, thb } from "@/lib/utils";
import { TokenUsageStamp } from "./TokenUsageStamp";

type Recommendation = {
  title: string;
  rationale: string;
  priority: string;
  impact: string;
};

type Allocation = { label: string; currentPct: number; suggestedPct: number };
type Source = { title: string; url: string };

type RecResult = {
  headline: string;
  overallVerdict: string;
  summary: string;
  projection: { horizonYears: number; estimatedValue: number; assumptionNote: string };
  recommendations: Recommendation[];
  allocation: Allocation[];
  sources: Source[];
  usage?: { inputTokens: number | null; outputTokens: number | null; webSearches: number; model: string };
};

type PlanAccount = {
  name: string;
  accountType: string;
  assetDescription?: string;
  marketValue: number;
  expectedAnnualReturn: number;
  monthlyContribution: number;
  annualContribution: number;
  isTaxAdvantaged: boolean;
  currency?: string;
};

type Props = {
  investments: PlanAccount[];
  profile: { age?: number; retirementAge?: number; riskProfile?: string; country?: string };
  totals: { totalValue: number; taxAdvantaged: number; monthlyContribs: number; weightedReturn: number };
  horizonYears?: number;
};

const VERDICT_COLORS: Record<string, string> = {
  "well-positioned": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "needs-rebalancing": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "under-diversified": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "over-conservative": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "over-aggressive": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function AIRecommendationCard({ investments, profile, totals, horizonYears = 20 }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  // ON-DEMAND ONLY: nothing runs until the user clicks. This is the
  // token-saving design — each click is one deliberate Anthropic API call.
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRanOnce(true);
    try {
      const res = await fetch("/api/investments/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investments, profile, totals, horizonYears }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.message ?? "Recommendation failed. Please try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [investments, profile, totals, horizonYears]);

  const verdictKey = result?.overallVerdict?.toLowerCase() ?? "";
  const verdictColor = VERDICT_COLORS[verdictKey] ?? VERDICT_COLORS["needs-rebalancing"];

  return (
    <Card className="mb-6 border-violet-200 dark:border-violet-900/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            AI Investment Recommendation
          </CardTitle>
          <Button size="sm" onClick={run} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {ranOnce ? "Refresh recommendation" : "Get AI recommendation"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          On-demand only — runs Claude with capped live web research when you click, so no tokens are
          spent until you ask.
        </p>
      </CardHeader>

      <CardContent>
        {!ranOnce && !loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Sparkles size={28} className="text-violet-400" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Click <span className="font-medium">Get AI recommendation</span> to analyze your current
              plan against live market and Thai tax conditions, with a projected value and prioritized
              actions.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={30} className="animate-spin text-violet-500" />
            <p className="text-sm text-muted-foreground">Researching markets &amp; analyzing your plan…</p>
            <p className="text-xs text-muted-foreground">This can take 8–20 seconds with web research</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2.5 rounded-lg p-3 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Verdict + headline */}
            <div className="space-y-2">
              <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", verdictColor)}>
                {result.overallVerdict?.replace(/-/g, " ")}
              </span>
              <h4 className="text-base font-semibold leading-snug">{result.headline}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
            </div>

            {/* Projection */}
            {result.projection && (
              <div className="rounded-lg border border-border p-3 bg-accent/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-violet-600 mb-1">
                  <TrendingUp size={12} />
                  Projected value · {result.projection.horizonYears} yr
                </div>
                <div className="text-xl font-bold">{thb(result.projection.estimatedValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">{result.projection.assumptionNote}</p>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Recommended actions
                </div>
                <ol className="space-y-3">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium">{r.title}</span>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", PRIORITY_COLORS[r.priority?.toLowerCase()] ?? PRIORITY_COLORS.low)}>
                          {r.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{r.rationale}</p>
                      {r.impact && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                          <ArrowRight size={12} />
                          {r.impact}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Allocation */}
            {result.allocation?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Suggested allocation
                </div>
                <div className="space-y-2">
                  {result.allocation.map((a, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center justify-between mb-0.5">
                        <span>{a.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {a.currentPct}% <ArrowRight size={11} className="inline mx-0.5" /> {a.suggestedPct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${Math.max(0, Math.min(100, a.suggestedPct))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {result.sources?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Sources ({result.sources.length})
                </div>
                <ul className="space-y-1.5">
                  {result.sources.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm">
                      <ExternalLink size={12} className="shrink-0 mt-1 text-muted-foreground" />
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 dark:text-violet-400 hover:underline break-all"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer: provenance + token usage */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Claude Haiku 4.5</Badge>
                {result.usage && result.usage.webSearches > 0 && (
                  <Badge variant="outline">{result.usage.webSearches} web search{result.usage.webSearches === 1 ? "" : "es"}</Badge>
                )}
              </div>
              {result.usage && (
                <TokenUsageStamp
                  inputTokens={result.usage.inputTokens}
                  outputTokens={result.usage.outputTokens}
                  remainingTokens={null}
                  tokenLimit={null}
                />
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              AI-generated guidance for information only — not financial advice. Verify figures against
              the linked sources before acting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
