"use client";
import { useState, useCallback } from "react";
import { Button, Badge } from "@/components/ui";
import { Brain, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Lightbulb, ClipboardList } from "lucide-react";
import { cn, thb } from "@/lib/utils";
import type { InvestmentScenario } from "./snapshots";

type AnalysisResult = {
  verdict: string;
  headline: string;
  analysis: string;
  risks: string[];
  opportunities: string[];
  actionPlan: { step: string; horizon: string; effortHours: number }[];
  confidenceScore: number;
};

type AICoachPanelProps = {
  scenario: InvestmentScenario;
  baseProjection: number[];
  scenarioProjection: number[];
  profile: { age?: number; retirementYear?: number; riskProfile?: string };
};

const VERDICT_COLORS: Record<string, string> = {
  conservative: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  balanced: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "moderately aggressive": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  aggressive: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  unrealistic: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function AICoachPanel({ scenario, baseProjection, scenarioProjection, profile }: AICoachPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpen(true);
    try {
      const res = await fetch("/api/investments/scenario-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: {
            ...scenario,
            overrides: scenario.overrides.map(o => ({ ...o, accountName: o.accountName ?? o.accountId })),
          },
          baseProjection,
          scenarioProjection,
          profile,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.message ?? "AI analysis failed. Try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [scenario, baseProjection, scenarioProjection, profile]);

  const confidencePct = result ? Math.round(result.confidenceScore * 100) : 0;
  const verdictKey = result?.verdict?.toLowerCase() ?? "";
  const verdictColor = VERDICT_COLORS[verdictKey] ?? VERDICT_COLORS.balanced;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={runAnalysis}
        disabled={loading}
        className="gap-1.5"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
        Analyze this scenario
      </Button>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className={cn(
            "relative ml-auto h-full w-full max-w-lg bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden",
            "transition-transform duration-300"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-violet-500" />
                <h3 className="font-semibold">AI Scenario Coach</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-accent rounded-md">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={32} className="animate-spin text-violet-500" />
                  <p className="text-sm text-muted-foreground">Analyzing your scenario…</p>
                  <p className="text-xs text-muted-foreground">This takes 3–8 seconds</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg p-3 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {result && (
                <>
                  {/* Verdict + headline */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", verdictColor)}>
                        {result.verdict}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Confidence: {confidencePct}%
                      </span>
                    </div>
                    <h4 className="text-base font-semibold leading-snug">{result.headline}</h4>
                  </div>

                  {/* Analysis paragraphs */}
                  <div className="space-y-3">
                    {result.analysis.split("\n\n").filter(Boolean).map((p, i) => (
                      <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
                    ))}
                  </div>

                  {/* Risks */}
                  {result.risks?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-red-600 mb-2">
                        <AlertTriangle size={12} />
                        Risks
                      </div>
                      <ul className="space-y-1.5">
                        {result.risks.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-red-400 mt-0.5">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Opportunities */}
                  {result.opportunities?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-emerald-600 mb-2">
                        <Lightbulb size={12} />
                        Opportunities
                      </div>
                      <ul className="space-y-1.5">
                        {result.opportunities.map((o, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-emerald-500 mt-0.5">•</span>
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Plan */}
                  {result.actionPlan?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-blue-600 mb-2">
                        <ClipboardList size={12} />
                        Action Plan
                      </div>
                      <ol className="space-y-2">
                        {result.actionPlan.map((a, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-center font-semibold mt-0.5">
                              {i + 1}
                            </span>
                            <div>
                              <span className="text-sm">{a.step}</span>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">{a.horizon}</span>
                                <span className="text-xs text-muted-foreground">~{a.effortHours}h</span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border shrink-0 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Powered by Claude Sonnet 4.6
              </span>
              <Button size="sm" variant="outline" onClick={runAnalysis} disabled={loading}>
                {loading ? <Loader2 size={12} className="animate-spin" /> : "Re-analyze"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
