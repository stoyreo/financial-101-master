"use client";

/**
 * LIVE COACH
 * ──────────
 * "Ask Claude" button. Builds a compact snapshot of the user's forecast
 * and posts it to /api/coach/forecast. Renders a quick summary, traffic
 * light, alerts, and prioritized next-actions.
 *
 * Result is cached in memory until the user clicks Refresh.
 */

import { useMemo, useState } from "react";
import {
  Sparkles, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2,
  Zap, Calendar, Hammer, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { calcAge } from "@/lib/utils";
import { aiProviderHeaders } from "@/lib/ai-model-pref";
import ModelPicker from "@/components/ai/ModelPicker";

interface CoachAlert {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}
interface CoachAction {
  title: string;
  why: string;
  effort: "quick" | "medium" | "deep";
}
interface CoachResult {
  summary: string;
  trafficLight: "green" | "amber" | "red";
  alerts: CoachAlert[];
  nextActions: CoachAction[];
  confidence: number;
  generatedAt?: string;
}

const TRAFFIC: Record<CoachResult["trafficLight"], { dot: string; label: string; ring: string }> = {
  green: { dot: "bg-emerald-500", label: "On track", ring: "ring-emerald-500/30 bg-emerald-500/5" },
  amber: { dot: "bg-amber-500",   label: "Drift risk", ring: "ring-amber-500/30 bg-amber-500/5" },
  red:   { dot: "bg-red-500",     label: "Off track",  ring: "ring-red-500/30 bg-red-500/5" },
};

const ALERT_STYLE: Record<CoachAlert["severity"], { icon: any; color: string }> = {
  info:     { icon: Info,         color: "text-sky-500" },
  warning:  { icon: AlertTriangle,color: "text-amber-500" },
  critical: { icon: AlertCircle,  color: "text-red-500" },
};

const EFFORT_BADGE: Record<CoachAction["effort"], { label: string; icon: any; class: string }> = {
  quick:  { label: "Today",      icon: Zap,      class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  medium: { label: "This month", icon: Calendar, class: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  deep:   { label: "Multi-month",icon: Hammer,   class: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
};

export function LiveCoach() {
  const {
    yearlyForecast, monthlyForecast, profile,
    scenarios, activeScenarioId,
  } = useStore();
  const scenario = scenarios.find(s => s.id === activeScenarioId) ?? scenarios[0];

  const [result, setResult] = useState<CoachResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Compact snapshot for the API.
  const snapshot = useMemo(() => {
    if (yearlyForecast.length === 0) return null;
    const today = yearlyForecast[0];
    const finalYear = yearlyForecast[yearlyForecast.length - 1];
    const retirementYear = yearlyForecast.find(y => y.isRetired);
    const mortgagePayoff = yearlyForecast.find(y => y.isMortgagePaidOff && yearlyForecast[0].mortgageBalance > 0);
    const debtFree = yearlyForecast.find(y => y.totalDebtBalance <= 0 && yearlyForecast[0].totalDebtBalance > 0);
    const negCount = monthlyForecast.filter(m => m.isNegativeCashFlow).length;
    const worstDSR = yearlyForecast.reduce<{ year: number; value: number } | null>((acc, y) => {
      if (!acc || y.debtServiceRatio > acc.value) return { year: y.year, value: y.debtServiceRatio };
      return acc;
    }, null);

    const savingsRate = today.totalIncome > 0
      ? (today.totalIncome - today.totalExpenses - today.totalDebtPayments) / today.totalIncome
      : 0;

    return {
      today: {
        income: Math.round(today.totalIncome),
        expenses: Math.round(today.totalExpenses),
        debtPayments: Math.round(today.totalDebtPayments),
        netCashFlow: Math.round(today.netCashFlow),
        debtBalance: Math.round(today.totalDebtBalance),
        investmentBalance: Math.round(today.investmentBalance),
        netWorth: Math.round(today.netWorth),
        savingsRate,
      },
      atRetirement: retirementYear ? {
        year: retirementYear.year,
        age: retirementYear.age,
        netWorth: Math.round(retirementYear.netWorth),
        expenses: Math.round(retirementYear.totalExpenses),
      } : undefined,
      finalYear: {
        year: finalYear.year,
        age: finalYear.age,
        netWorth: Math.round(finalYear.netWorth),
      },
      mortgagePayoffYear: mortgagePayoff?.year,
      debtFreeYear: debtFree?.year,
      negativeCashFlowMonths: negCount,
      worstDSR: worstDSR ?? undefined,
    };
  }, [yearlyForecast, monthlyForecast]);

  const ageNow = calcAge(profile.dateOfBirth);

  const ask = async () => {
    if (!snapshot) {
      setError("No forecast data — add income/expenses first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiProviderHeaders() },
        body: JSON.stringify({
          profile: {
            age: ageNow,
            retirementAge: profile.retirementAge,
            lifeExpectancy: profile.lifeExpectancy,
            riskProfile: profile.riskProfile,
            currency: profile.currency,
          },
          scenario: { name: scenario?.name, assumptions: scenario?.assumptions },
          snapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Coach unavailable.");
        setResult(null);
      } else {
        setResult(data);
        setCollapsed(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const trafficStyle = result ? TRAFFIC[result.trafficLight] : null;

  return (
    <Card className={`mb-6 ${trafficStyle ? `ring-1 ${trafficStyle.ring}` : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-600">
              <Sparkles size={18} />
            </div>
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                Live AI Coach
                {result && trafficStyle && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                    <span className={`relative flex h-2 w-2`}>
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${trafficStyle.dot} opacity-60`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${trafficStyle.dot}`} />
                    </span>
                    {trafficStyle.label}
                  </span>
                )}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Ask Claude for a quick on-track check + alerts, on demand.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModelPicker />
            {result && (
              <button
                onClick={() => setCollapsed(c => !c)}
                className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
            <Button size="sm" onClick={ask} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw size={12} className="animate-spin" /> Asking Claude…
                </>
              ) : result ? (
                <>
                  <RefreshCw size={12} /> Refresh
                </>
              ) : (
                <>
                  <Sparkles size={12} /> Get live insights
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
            {error}
          </div>
        </CardContent>
      )}

      {result && !collapsed && (
        <CardContent className="pt-0 space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Summary
            </div>
            <p className="text-sm leading-relaxed">{result.summary}</p>
          </div>

          {/* Alerts */}
          {result.alerts && result.alerts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Alerts ({result.alerts.length})
              </div>
              {result.alerts.map((a, i) => {
                const style = ALERT_STYLE[a.severity];
                const Icon = style.icon;
                return (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-3">
                    <Icon size={15} className={`shrink-0 mt-0.5 ${style.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Next actions */}
          {result.nextActions && result.nextActions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Next actions to stay on track
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.nextActions.map((a, i) => {
                  const eff = EFFORT_BADGE[a.effort];
                  const Icon = eff.icon;
                  return (
                    <div key={i} className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="text-xs font-semibold leading-snug">{a.title}</div>
                        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${eff.class}`}>
                          <Icon size={10} /> {eff.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{a.why}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
            <span>Confidence: {result.confidence ?? "—"}%</span>
            <span>
              {result.generatedAt
                ? `Generated ${new Date(result.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          </div>
        </CardContent>
      )}

      {!result && !error && (
        <CardContent className="pt-0">
          <div className="text-xs text-muted-foreground italic">
            Click "Get live insights" to have Claude review your projection and flag what to watch.
          </div>
        </CardContent>
      )}
    </Card>
  );
}
