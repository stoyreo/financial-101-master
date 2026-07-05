"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Calculator, TrendingUp, Info, Save, Trash2, Sparkles, Loader2, AlertTriangle, FolderOpen,
  ChevronDown, ChevronRight, History, Radar, Plus, X, ExternalLink,
} from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardContent, NumberInput, Select, Label, Badge, Button, Input,
  InfoTooltip,
} from "@/components/ui";
import { cn, pct, thb } from "@/lib/utils";
import { getAllFunds, geometricMean, type FundInfo } from "@/lib/fund-registry";
import { computeIncomeTaxBreakdown, getMarginalRate, getBracketLabel } from "@/lib/engine/tax";
import { useStore } from "@/lib/store";
import { getSession } from "@/lib/auth-client";
import { TokenUsageStamp } from "./TokenUsageStamp";
import {
  type DCAScenario, loadDCAScenarios, addDCAScenario, removeDCAScenario,
} from "./dca-scenarios";
import {
  type RMFScan, loadRMFScans, addRMFScan, removeRMFScan, RMF_SCAN_EVENT,
} from "./rmf-scan-history";
import {
  type RadarFund, loadRadar, addToRadar, removeFromRadar, isOnRadar, isValidCode,
  RMF_RADAR_EVENT,
} from "./rmf-radar";
import { brokerLinkForFund, BROKER_DIRECTORY } from "./thai-broker-links";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskIndicator = { name: string; note: string };
type RiskCategory = { score: number; indicators: RiskIndicator[] };
type RiskBreakdown = { geopolitics: RiskCategory; wealth: RiskCategory; stability: RiskCategory };

type AIFund = {
  rank: number;
  code: string;
  name: string;
  manager: string;
  yoyReturnPct: number;
  /** 1-8, server-derived from riskBreakdown — see computeOverallRisk on the API route */
  riskLevel: number;
  riskBreakdown?: RiskBreakdown;
  note: string;
};

const RISK_CATEGORY_LABELS: { key: keyof RiskBreakdown; label: string }[] = [
  { key: "geopolitics", label: "Geopolitics" },
  { key: "wealth", label: "Wealth / economic" },
  { key: "stability", label: "Stability" },
];

interface Props {
  /** Current user, for loading their registered funds (built-in + custom) */
  userId?: string;
  /** AI best-estimate returns, keyed by fund code, populated as each fund's
   *  FundForecastCard finishes loading. Generalises the old aiPVDReturn /
   *  aiSCBGoldReturn pair, which only worked for two hardcoded SCB funds. */
  aiReturnByFundCode?: Record<string, number>;
}

const TAX_BRACKETS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35];

// ── DCA math ──────────────────────────────────────────────────────────────────
// Future value of a level monthly contribution, compounded monthly,
// using a monthly rate derived from the annual rate so it matches the
// annual % shown elsewhere (geometric/AI-estimate based).

function monthlyRateFromAnnual(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function fvOfMonthlyDCA(monthly: number, annualRate: number, months: number): number {
  const rm = monthlyRateFromAnnual(annualRate);
  if (rm === 0) return monthly * months;
  return monthly * ((Math.pow(1 + rm, months) - 1) / rm);
}

// RMF contribution is deductible up to 30% of assessable income, capped at
// ฿500,000 combined with PVD/SSF. This simulator assumes the user's RMF
// contribution alone is within that combined cap (a simplifying assumption —
// flagged in the UI) and estimates relief as contribution × marginal rate.
function estimateAnnualTaxRelief(annualContribution: number, marginalRate: number): number {
  const deductible = Math.min(annualContribution, 500_000);
  return deductible * marginalRate;
}

// Custom X-axis tick: shows the calendar year on one line and the profile
// owner's projected age on the line below, so the timeline reads in both
// "when" and "how old will I be" terms.
function YearAgeTick({ x, y, payload, birthYear }: any) {
  const year = payload.value as number;
  const age = birthYear ? year - birthYear : null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fontSize={10} fill="currentColor" className="fill-muted-foreground">
        {year}
      </text>
      {age !== null && (
        <text x={0} y={0} dy={22} textAnchor="middle" fontSize={9} fill="currentColor" className="fill-muted-foreground/70">
          {`(${age}y)`}
        </text>
      )}
    </g>
  );
}

// Compact "when did this scan run" label for the recent-scans list.
function scanTimeLabel(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DCASimulatorCard({ userId: userIdProp, aiReturnByFundCode = {} }: Props) {
  const { incomes, profile } = useStore();

  // Collapsed by default — this is a deep "what-if" tool, not something that
  // needs to be open on every page load.
  const [collapsed, setCollapsed] = useState(true);

  // Registry of built-in example funds + this user's own custom-added funds —
  // populates the "Fund / Return Basis" dropdown dynamically instead of two
  // hardcoded SCB-fund options.
  const funds = useMemo(() => getAllFunds(userIdProp || ""), [userIdProp]);
  const [fundChoice, setFundChoice] = useState<string>(() => funds[0]?.code ?? "custom");
  // Monthly DCA is tracked per fund choice — switching the dropdown should
  // show that fund's own remembered amount, not carry over (or accumulate
  // with) whatever was typed for a previously-selected fund.
  const DEFAULT_MONTHLY_AMOUNT = 5000;
  const [monthlyAmountByFund, setMonthlyAmountByFund] = useState<Record<string, number>>({});
  const monthlyAmount = monthlyAmountByFund[fundChoice] ?? DEFAULT_MONTHLY_AMOUNT;
  const setMonthlyAmount = (v: number) => {
    setMonthlyAmountByFund(prev => ({ ...prev, [fundChoice]: v }));
  };
  const [years, setYears] = useState(15);
  const [customRate, setCustomRate] = useState(7); // % — used when fundChoice === "custom" or "ai:*"
  const [taxBracket, setTaxBracket] = useState(0.10);
  const [usedSuggestedBracket, setUsedSuggestedBracket] = useState(false);

  // ── AI-researched top RMF funds (on-demand, web-grounded) ───────────────────
  const [aiFunds, setAiFunds] = useState<AIFund[] | null>(null);
  const [aiFundsStatus, setAiFundsStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiFundsError, setAiFundsError] = useState<string | null>(null);
  const [aiFundsAsOf, setAiFundsAsOf] = useState<string | null>(null);
  const [aiFundsSources, setAiFundsSources] = useState<{ title: string; url: string }[]>([]);
  const [aiFundsUsage, setAiFundsUsage] = useState<{ inputTokens: number | null; outputTokens: number | null } | null>(null);
  const [expandedRiskCode, setExpandedRiskCode] = useState<string | null>(null);
  // Soft, non-blocking caveat about data freshness (e.g. "figures are YTD, not
  // full-year") — shown alongside a SUCCESSFUL result, distinct from a hard
  // backend failure. Never blocks the funds from displaying.
  const [aiFundsCaveat, setAiFundsCaveat] = useState<string | null>(null);

  // ── Recent scans (traceable history) + RMF radar (type-to-add watchlist) ────
  const scanUserId = userIdProp || getSession()?.userId || "";
  const [recentScans, setRecentScans] = useState<RMFScan[]>([]);
  const [showAllScans, setShowAllScans] = useState(false);
  const [radar, setRadar] = useState<RadarFund[]>([]);
  const [radarInput, setRadarInput] = useState("");
  const [radarMsg, setRadarMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!scanUserId) return;
    const syncScans = () => setRecentScans(loadRMFScans(scanUserId));
    const syncRadar = () => setRadar(loadRadar(scanUserId));
    syncScans();
    syncRadar();
    window.addEventListener(RMF_SCAN_EVENT, syncScans);
    window.addEventListener(RMF_RADAR_EVENT, syncRadar);
    return () => {
      window.removeEventListener(RMF_SCAN_EVENT, syncScans);
      window.removeEventListener(RMF_RADAR_EVENT, syncRadar);
    };
  }, [scanUserId]);

  const handleAddRadar = (code: string, meta?: Partial<RadarFund>) => {
    if (!scanUserId) return;
    const res = addToRadar(scanUserId, code, meta);
    if (res.ok) {
      setRadarMsg(null);
      setRadarInput("");
    } else {
      setRadarMsg(
        res.reason === "duplicate" ? `${code.toUpperCase()} is already on your radar.`
        : res.reason === "full" ? "Radar is full — remove a fund first."
        : "Enter a valid fund code (e.g. DAOL-GOLDRMF).",
      );
    }
  };

  const handleTypedAdd = () => {
    const code = radarInput;
    if (!code.trim()) return;
    handleAddRadar(code, { source: "typed" });
  };

  // Reload a past scan's ranking back into the card, exactly as it was captured.
  const handleReloadScan = (s: RMFScan) => {
    setAiFunds(s.funds.map(f => ({ ...f })));
    setAiFundsAsOf(s.asOf);
    setAiFundsSources(s.sources);
    setAiFundsCaveat(s.caveat);
    setAiFundsStatus("done");
    setAiFundsError(null);
    const top = s.funds.find(f => f.rank === 1) ?? s.funds[0];
    if (top) setFundChoice(`ai:${top.code}`);
  };

  const fetchTopRMFFunds = async () => {
    setAiFundsStatus("loading");
    setAiFundsError(null);
    setAiFundsCaveat(null);
    try {
      const res = await fetch("/api/investments/rmf-top-funds", { method: "POST" });
      const data = await res.json();
      // Only treat this as a hard failure for genuine backend problems
      // (no API key, rate limited, auth failed, etc., or an HTTP error
      // status) — NOT for the AI simply not finding fully-current-year data.
      // The route never reports "no funds found" as `data.error`; it
      // returns `funds: []` with a `noDataReason` instead, so this check no
      // longer misfires on the model's own freshness caveats.
      if (!res.ok || data.error) {
        setAiFundsError(data.message ?? "Could not fetch fund rankings. Please try again.");
        setAiFundsStatus("error");
        return;
      }
      const funds: AIFund[] = data.funds ?? [];
      setAiFunds(funds);
      setAiFundsAsOf(data.asOf ?? null);
      setAiFundsSources(data.sources ?? []);
      setAiFundsUsage(data.usage ?? null);
      if (funds.length === 0) {
        // Best-effort search came back empty this time — soft caveat, not a
        // hard error. Let the user retry without an alarming failure state.
        setAiFundsCaveat(data.noDataReason ?? "No verified fund data found this time — try again in a moment.");
        setAiFundsStatus("idle");
        return;
      }
      setAiFundsCaveat(
        [data.returnPeriod ? `Figures shown are for ${data.returnPeriod}.` : null, data.dataFreshnessNote]
          .filter(Boolean)
          .join(" ") || null,
      );
      setAiFundsStatus("done");
      // Persist this scan to the traceable history so the user can reopen it
      // later — a full snapshot (top-5 + as-of + freshness caveat), not just a
      // timestamp. sessionStorage, per-user (see rmf-scan-history.ts).
      if (scanUserId) {
        addRMFScan(scanUserId, {
          id: `${Date.now()}`,
          scannedAt: new Date().toISOString(),
          asOf: data.asOf ?? null,
          returnPeriod: data.returnPeriod ?? null,
          caveat: data.dataFreshnessNote ?? null,
          funds: funds.map(f => ({
            rank: f.rank, code: f.code, name: f.name, manager: f.manager,
            yoyReturnPct: f.yoyReturnPct, riskLevel: f.riskLevel, note: f.note,
          })),
          sources: data.sources ?? [],
        });
      }
      // Auto-select the #1-ranked fund into the Fund/Return Basis dropdown —
      // the user asked for the AI result to populate the dropdown automatically
      // rather than requiring a manual pick after researching.
      const top = funds.find(f => f.rank === 1) ?? funds[0];
      if (top) setFundChoice(`ai:${top.code}`);
    } catch {
      setAiFundsError("Network error. Check your connection and try again.");
      setAiFundsStatus("error");
    }
  };

  // ── Saved scenarios (sessionStorage, per-user) ───────────────────────────────
  const userId = userIdProp || getSession()?.userId;
  const [savedScenarios, setSavedScenarios] = useState<DCAScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");

  useEffect(() => {
    if (userId) setSavedScenarios(loadDCAScenarios(userId));
  }, [userId]);

  // ── Return basis ──────────────────────────────────────────────────────────
  const selectedAIFund = fundChoice.startsWith("ai:")
    ? aiFunds?.find(f => f.code === fundChoice.slice(3))
    : undefined;
  const selectedRegistryFund: FundInfo | undefined = funds.find(f => f.code === fundChoice);

  // Explainability for the AI ranking: how the picked fund compares to the
  // rest of the AI's top-5 list and to the registered funds already tracked
  // in this app, so "how good is it" has a concrete, checkable answer rather
  // than just trusting the AI's rank order.
  const aiFundStats = useMemo(() => {
    if (!aiFunds || aiFunds.length === 0) return null;
    const avgYoY = aiFunds.reduce((s, f) => s + f.yoyReturnPct, 0) / aiFunds.length;
    const sorted = [...aiFunds].sort((a, b) => b.yoyReturnPct - a.yoyReturnPct);
    const best = sorted[0];
    const runnerUp = sorted[1];
    return { avgYoY, best, runnerUp };
  }, [aiFunds]);

  const fundReturn = useMemo(() => {
    if (selectedRegistryFund) {
      return aiReturnByFundCode[selectedRegistryFund.code] ?? geometricMean(selectedRegistryFund) / 100;
    }
    if (selectedAIFund) return selectedAIFund.yoyReturnPct / 100;
    return customRate / 100;
  }, [selectedRegistryFund, aiReturnByFundCode, customRate, selectedAIFund]);

  const returnSource = useMemo(() => {
    if (selectedRegistryFund) {
      return aiReturnByFundCode[selectedRegistryFund.code] !== undefined ? "ai" : "historical";
    }
    if (selectedAIFund) return "ai-research";
    return "manual";
  }, [selectedRegistryFund, aiReturnByFundCode, selectedAIFund]);

  // ── Auto-suggested tax bracket ───────────────────────────────────────────────
  // Explainable rule-based suggestion (not an LLM call): derives the user's
  // marginal Thai PIT rate straight from their Income page entries, using the
  // same progressive-bracket math as the Tax page. Shown only if they have
  // active taxable income on record.
  const incomeTaxBreakdown = useMemo(() => computeIncomeTaxBreakdown(incomes), [incomes]);
  const hasIncomeData = incomeTaxBreakdown.grossAnnualIncome > 0;
  const suggestedRate = useMemo(
    () => getMarginalRate(incomeTaxBreakdown.netTaxableIncome),
    [incomeTaxBreakdown.netTaxableIncome],
  );
  const suggestedBracketLabel = useMemo(
    () => getBracketLabel(incomeTaxBreakdown.netTaxableIncome),
    [incomeTaxBreakdown.netTaxableIncome],
  );

  // Apply the suggestion once, the first time it becomes available, without
  // fighting the user if they've already picked a bracket manually.
  useEffect(() => {
    if (hasIncomeData && !usedSuggestedBracket) {
      setTaxBracket(suggestedRate);
      setUsedSuggestedBracket(true);
    }
  }, [hasIncomeData, suggestedRate, usedSuggestedBracket]);

  const months = Math.max(1, Math.round(years * 12));
  const totalInvested = monthlyAmount * months;
  const futureValue = fvOfMonthlyDCA(monthlyAmount, fundReturn, months);
  const totalGrowth = futureValue - totalInvested;
  const roiPct = totalInvested > 0 ? totalGrowth / totalInvested : 0;

  // Tax relief — assume contributions are made into an RMF (qualifying for relief),
  // saved each year on the annual contribution amount, summed over the holding period.
  const annualContribution = monthlyAmount * 12;
  const annualTaxRelief = estimateAnnualTaxRelief(annualContribution, taxBracket);
  const totalTaxRelief = annualTaxRelief * years;
  const combinedBenefit = totalGrowth + totalTaxRelief;
  const combinedRoiPct = totalInvested > 0 ? combinedBenefit / totalInvested : 0;

  // Year-by-year chart data, including cumulative tax relief as its own series.
  const birthYear = profile?.dateOfBirth ? new Date(profile.dateOfBirth).getFullYear() : null;
  const chartData = useMemo(() => {
    return Array.from({ length: years + 1 }, (_, yr) => {
      const m = yr * 12;
      const invested = monthlyAmount * m;
      const value = fvOfMonthlyDCA(monthlyAmount, fundReturn, m);
      const taxRelief = annualTaxRelief * yr;
      return {
        year: new Date().getFullYear() + yr,
        invested: Math.round(invested),
        value: Math.round(value),
        taxRelief: Math.round(taxRelief),
      };
    });
  }, [years, monthlyAmount, fundReturn, annualTaxRelief]);

  // ── Save / load / remove scenarios ───────────────────────────────────────────
  const fundLabel = selectedRegistryFund
    ? selectedRegistryFund.code
    : selectedAIFund
    ? `${selectedAIFund.code} (AI-suggested)`
    : `Custom (${pct(customRate / 100)})`;

  const handleSave = () => {
    if (!userId) return;
    const name = scenarioName.trim() || `${fundLabel} · ฿${monthlyAmount.toLocaleString()}/mo · ${years}y`;
    const scenario: DCAScenario = {
      id: `${Date.now()}`,
      name,
      fundChoice,
      fundLabel,
      monthlyAmount,
      years,
      customRatePct: customRate,
      taxBracket,
      results: { totalInvested, futureValue, roiPct, totalTaxRelief, combinedRoiPct },
      createdAt: new Date().toISOString(),
    };
    setSavedScenarios(addDCAScenario(userId, scenario));
    setScenarioName("");
  };

  const handleRemove = (id: string) => {
    if (!userId) return;
    setSavedScenarios(removeDCAScenario(userId, id));
  };

  const handleLoad = (s: DCAScenario) => {
    setFundChoice(s.fundChoice);
    setMonthlyAmountByFund(prev => ({ ...prev, [s.fundChoice]: s.monthlyAmount }));
    setYears(s.years);
    setCustomRate(s.customRatePct);
    setTaxBracket(s.taxBracket);
  };

  // dca-scenarios.ts prepends on save, so the most recently saved entry is
  // always first — used for the "last saved" summary shown on the card.
  const lastSaved = savedScenarios[0] ?? null;
  const lastSavedRelative = useMemo(() => {
    if (!lastSaved) return null;
    const ms = Date.now() - new Date(lastSaved.createdAt).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }, [lastSaved]);

  return (
    <Card className="mb-6 border-blue-200 dark:border-blue-800">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed(c => !c);
          }
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown size={16} className="text-muted-foreground shrink-0" />
            )}
            <Calculator size={16} className="text-blue-500" />
            <CardTitle className="text-sm">DCA / RMF ROI Simulator</CardTitle>
            <Badge variant="outline" className="text-xs">What-if</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          If I invest a fixed amount every month (DCA) into an RMF for N years, what's my ROI —
          including the income tax relief from RMF contributions?
        </p>
      </CardHeader>

      {!collapsed && (
      <CardContent className="space-y-4 pt-0">
        {/* ── Last saved assumption summary ──────────────────────────────────── */}
        {lastSaved && (
          <button
            type="button"
            onClick={() => handleLoad(lastSaved)}
            className="w-full flex items-center justify-between gap-3 text-xs bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40 rounded-md px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title="Click to reload this saved assumption"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-muted-foreground shrink-0">Last saved:</span>
              <span className="font-medium truncate">{lastSaved.name}</span>
              <span className="text-muted-foreground shrink-0">{lastSavedRelative}</span>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium shrink-0">Reload</span>
          </button>
        )}

        {/* ── AI: top RMF funds by YoY return ────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={fetchTopRMFFunds} disabled={aiFundsStatus === "loading"}>
            {aiFundsStatus === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {aiFunds ? "Refresh top 5 RMF (AI)" : "Find top 5 RMF with tax relief (AI)"}
          </Button>
          <InfoTooltip content="Asks Claude to web-search current Thai RMF funds (tax-relief eligible) and rank the top 5 by year-over-year return. Capped at 3 searches per click — nothing runs automatically." />
          {aiFundsAsOf && (
            <span className="text-xs text-muted-foreground">Ranked as of {aiFundsAsOf}</span>
          )}
        </div>

        {aiFundsStatus === "error" && aiFundsError && (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{aiFundsError}</span>
          </div>
        )}

        {/* Soft, non-blocking caveat — data freshness note on a successful
            result, or "nothing found this time, try again" — never the same
            alarming treatment as a genuine backend failure above. */}
        {aiFundsCaveat && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5">
            <Info size={13} className="shrink-0" />
            <span>{aiFundsCaveat}</span>
          </div>
        )}

        {/* ── Recent scans (traceable history) ───────────────────────────── */}
        {recentScans.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-xs font-medium flex items-center gap-1.5">
              <History size={12} className="text-blue-500" />
              Recent scans
              <span className="text-muted-foreground font-normal">({recentScans.length})</span>
              <InfoTooltip content="Every AI scan you run is saved here for this session so you can trace what was ranked when. Click a scan to reload its full ranking back into the card." />
            </div>
            <div className="divide-y divide-border/50">
              {(showAllScans ? recentScans : recentScans.slice(0, 3)).map(s => {
                const top = s.funds.find(f => f.rank === 1) ?? s.funds[0];
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
                    <button
                      type="button"
                      onClick={() => handleReloadScan(s)}
                      className="flex items-center gap-2 min-w-0 text-left"
                      title="Reload this scan's ranking"
                    >
                      <span className="text-muted-foreground shrink-0 tabular-nums">{scanTimeLabel(s.scannedAt)}</span>
                      {top && (
                        <span className="font-medium truncate">
                          #1 {top.code} · {pct(top.yoyReturnPct / 100)}
                        </span>
                      )}
                      <span className="text-muted-foreground shrink-0">
                        {s.funds.length} funds{s.asOf ? ` · as of ${s.asOf}` : ""}
                      </span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReloadScan(s)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Reload
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRMFScan(scanUserId, s.id)}
                        className="p-1 hover:bg-destructive/10 rounded-md"
                        title="Remove this scan from history"
                      >
                        <Trash2 size={12} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {recentScans.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllScans(v => !v)}
                className="w-full px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-muted/30 border-t border-border/50"
              >
                {showAllScans ? "Show fewer" : `Show all ${recentScans.length}`}
              </button>
            )}
          </div>
        )}

        {/* ── RMF Radar: type-to-add watchlist ───────────────────────────── */}
        <div className="rounded-lg border border-violet-200 dark:border-violet-800/50 overflow-hidden">
          <div className="bg-violet-50 dark:bg-violet-900/10 px-3 py-2 text-xs font-medium text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
            <Radar size={12} />
            RMF Radar
            <span className="text-violet-500/70 font-normal">({radar.length})</span>
            <InfoTooltip content="Type any Thai RMF fund code to keep it on your radar, or add one straight from a scan row. Stored for this session, per-user." />
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={radarInput}
                onChange={e => { setRadarInput(e.target.value); setRadarMsg(null); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleTypedAdd(); } }}
                placeholder="Type a fund code, e.g. DAOL-GOLDRMF"
                className="max-w-xs font-mono uppercase"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleTypedAdd}
                disabled={!scanUserId || !radarInput.trim() || !isValidCode(radarInput)}
              >
                <Plus size={13} />
                Add to radar
              </Button>
            </div>
            {radarMsg && <p className="text-xs text-amber-600 dark:text-amber-400">{radarMsg}</p>}

            {radar.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing on your radar yet — type a fund code above, or hit “+ Radar” on any scan row below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {radar.map(f => {
                  const broker = brokerLinkForFund(f.code, f.manager);
                  return (
                    <div
                      key={f.code}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-1 py-1 text-xs"
                    >
                      <span className="font-mono font-semibold">{f.code}</span>
                      {typeof f.yoyReturnPct === "number" && (
                        <span className="text-muted-foreground tabular-nums">{pct(f.yoyReturnPct / 100)}</span>
                      )}
                      <a
                        href={broker.url}
                        target="_blank"
                        rel="noreferrer"
                        title={broker.label}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700"
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeFromRadar(scanUserId, f.code)}
                        className="p-0.5 rounded-full hover:bg-destructive/10"
                        title={`Remove ${f.code} from radar`}
                      >
                        <X size={12} className="text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground pt-1">
              <span>Find a broker:</span>
              {BROKER_DIRECTORY.map((b, i) => (
                <Fragment key={b.url}>
                  {i > 0 && <span>·</span>}
                  <a href={b.url} target="_blank" rel="noreferrer" className="hover:underline text-blue-600 dark:text-blue-400">
                    {b.label}
                  </a>
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* ── Inputs ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="flex items-center mb-1">
              <Label className="mb-0">Fund / Return Basis</Label>
              <InfoTooltip content="Which fund's historical or AI-forecast return drives the projection. 'Custom rate' lets you type any assumed annual return. AI-suggested funds appear here after you run the research above." />
            </div>
            <Select value={fundChoice} onChange={e => setFundChoice(e.target.value)} className="mt-1">
              {funds.length > 0 && (
                <optgroup label="Your registered funds">
                  {funds.map(f => (
                    <option key={f.code} value={f.code}>
                      {f.code} ({f.assetClass.replace("_", " ")})
                    </option>
                  ))}
                </optgroup>
              )}
              {aiFunds && aiFunds.length > 0 && (
                <optgroup label="AI-suggested top RMF (YoY)">
                  {aiFunds.map(f => (
                    <option key={f.code} value={`ai:${f.code}`}>
                      {f.rank}. {f.code} — {pct(f.yoyReturnPct / 100)} YoY
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">Custom rate</option>
            </Select>
          </div>
          <div>
            <div className="flex items-center mb-1">
              <Label className="mb-0">Monthly DCA (฿)</Label>
              <InfoTooltip content="Dollar-cost averaging: a fixed THB amount invested every month, regardless of the fund's price that month. Smooths out entry price over time." />
            </div>
            <NumberInput value={monthlyAmount} onChange={setMonthlyAmount} min={0} step={500} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <Label className="mb-0">Years</Label>
              <InfoTooltip content="Investment horizon — how many years you keep contributing and stay invested before withdrawing." />
            </div>
            <NumberInput value={years} onChange={v => setYears(Math.max(1, Math.min(50, v)))} min={1} max={50} step={1} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <Label className="mb-0">Your Tax Bracket</Label>
              <InfoTooltip content={
                "Your marginal Thai personal income tax rate — the rate charged on your NEXT baht of taxable income, " +
                "which is exactly the rate an RMF tax deduction saves you. Thai brackets run from 0% (≤฿150,000 taxable) " +
                "up to 35% (above ฿5,000,000 taxable). " +
                (hasIncomeData
                  ? `Auto-suggested as ${pct(suggestedRate)} from your Income page (net taxable income ${thb(incomeTaxBreakdown.netTaxableIncome)}/yr falls in the ${suggestedBracketLabel} bracket). Excludes PVD deduction for simplicity — adjust if needed.`
                  : "Add active income entries on the Income page to get this auto-suggested.")
              } />
            </div>
            <Select value={String(taxBracket)} onChange={e => setTaxBracket(parseFloat(e.target.value))} className="mt-1">
              {TAX_BRACKETS.map(b => (
                <option key={b} value={b}>{(b * 100).toFixed(0)}%</option>
              ))}
            </Select>
            {hasIncomeData && Math.abs(taxBracket - suggestedRate) > 0.001 && (
              <button
                type="button"
                onClick={() => setTaxBracket(suggestedRate)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
              >
                Use suggested ({pct(suggestedRate)})
              </button>
            )}
          </div>
        </div>

        {fundChoice === "custom" && (
          <div className="w-full sm:w-1/4">
            <Label>Assumed Annual Return (%)</Label>
            <NumberInput value={customRate} onChange={setCustomRate} step={0.5} className="mt-1" />
          </div>
        )}

        {selectedAIFund && (
          <div className="flex items-start gap-2 text-xs bg-violet-50 dark:bg-violet-900/10 rounded-lg p-3 text-violet-800 dark:text-violet-300">
            <Sparkles size={13} className="shrink-0 mt-0.5" />
            <span>
              {selectedAIFund.name} — {selectedAIFund.manager}. {selectedAIFund.note}
              {selectedAIFund.riskLevel > 0 && ` Risk level ${selectedAIFund.riskLevel}/8.`}
            </span>
          </div>
        )}

        {/* ── AI ranking explainability: how good is the pick, and vs what? ─── */}
        {aiFunds && aiFunds.length > 0 && aiFundStats && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-800/50 overflow-hidden">
            <div className="bg-violet-50 dark:bg-violet-900/10 px-3 py-2 text-xs font-medium text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
              <Sparkles size={12} />
              Why the AI ranked these this way
            </div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left font-medium px-3 py-1.5 w-5"></th>
                  <th className="text-left font-medium px-3 py-1.5">#</th>
                  <th className="text-left font-medium px-3 py-1.5">Fund</th>
                  <th className="text-right font-medium px-3 py-1.5">YoY</th>
                  <th className="text-right font-medium px-3 py-1.5">Risk</th>
                  <th className="text-left font-medium px-3 py-1.5">Why it ranks here</th>
                </tr>
              </thead>
              <tbody>
                {aiFunds.map(f => {
                  const isExpanded = expandedRiskCode === f.code;
                  const hasBreakdown = !!f.riskBreakdown;
                  return (
                    <Fragment key={f.code}>
                      <tr
                        className={cn(
                          "border-b border-border/50 last:border-0",
                          fundChoice === `ai:${f.code}` && "bg-violet-50/60 dark:bg-violet-900/10",
                        )}
                      >
                        <td className="px-3 py-1.5">
                          {hasBreakdown && (
                            <button
                              type="button"
                              onClick={() => setExpandedRiskCode(isExpanded ? null : f.code)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Show risk breakdown"
                              aria-label={isExpanded ? "Collapse risk breakdown" : "Expand risk breakdown"}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">{f.rank}</td>
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => setFundChoice(`ai:${f.code}`)}
                            className="font-medium hover:underline text-left"
                            title="Use this fund as the return basis"
                          >
                            {f.code}
                          </button>
                          <div className="text-muted-foreground">{f.manager}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{pct(f.yoyReturnPct / 100)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {f.riskLevel > 0 ? `${f.riskLevel}/8` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          <div>{f.note}</div>
                          <div className="mt-1 flex items-center gap-2.5">
                            {(() => {
                              const onRadar = scanUserId ? isOnRadar(scanUserId, f.code) : false;
                              return (
                                <button
                                  type="button"
                                  onClick={() => !onRadar && handleAddRadar(f.code, {
                                    source: "scan", manager: f.manager, name: f.name,
                                    yoyReturnPct: f.yoyReturnPct, riskLevel: f.riskLevel, note: f.note,
                                  })}
                                  disabled={onRadar}
                                  className={cn(
                                    "inline-flex items-center gap-0.5 font-medium",
                                    onRadar ? "text-muted-foreground/60 cursor-default" : "text-violet-600 dark:text-violet-400 hover:underline",
                                  )}
                                  title={onRadar ? `${f.code} is on your radar` : `Add ${f.code} to your radar`}
                                >
                                  {onRadar ? <Radar size={11} /> : <Plus size={11} />}
                                  {onRadar ? "On radar" : "Radar"}
                                </button>
                              );
                            })()}
                            {(() => {
                              const broker = brokerLinkForFund(f.code, f.manager);
                              return (
                                <a
                                  href={broker.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                  title={broker.label}
                                >
                                  <ExternalLink size={11} />
                                  Where to buy
                                </a>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && f.riskBreakdown && (
                        <tr className="border-b border-border/50 last:border-0 bg-muted/20">
                          <td colSpan={6} className="px-3 py-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {RISK_CATEGORY_LABELS.map(({ key, label }) => {
                                const cat = f.riskBreakdown![key];
                                if (!cat) return null;
                                return (
                                  <div key={key}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-foreground">{label}</span>
                                      <span className="tabular-nums text-muted-foreground">{cat.score}/5</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-border overflow-hidden mb-1.5">
                                      <div
                                        className={cn(
                                          "h-full rounded-full",
                                          cat.score <= 2 ? "bg-emerald-500" : cat.score === 3 ? "bg-amber-500" : "bg-red-500",
                                        )}
                                        style={{ width: `${(cat.score / 5) * 100}%` }}
                                      />
                                    </div>
                                    <ul className="space-y-0.5 text-muted-foreground">
                                      {cat.indicators.slice(0, 3).map((ind, i) => (
                                        <li key={i}>
                                          <span className="font-medium text-foreground/80">{ind.name}:</span> {ind.note}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-muted-foreground mt-2">
                              Final risk {f.riskLevel}/8 = average of the three category scores (1-5 each), rescaled to the
                              1-8 Thai SEC-style range — not a number the AI picked directly.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20 space-y-1">
              <p>
                <span className="font-medium text-foreground">#{aiFundStats.best.rank} {aiFundStats.best.code}</span> leads on raw
                1-year return at {pct(aiFundStats.best.yoyReturnPct / 100)}
                {aiFundStats.runnerUp && (
                  <> — {pct((aiFundStats.best.yoyReturnPct - aiFundStats.runnerUp.yoyReturnPct) / 100)} ahead of the #2 pick ({aiFundStats.runnerUp.code})</>
                )}
                , and {pct((aiFundStats.best.yoyReturnPct - aiFundStats.avgYoY) / 100)} above the average of these 5 ({pct(aiFundStats.avgYoY / 100)}).
              </p>
              <p>
                For context, your registered funds' historical CAGR is shown in the dropdown above — a single
                year's YoY number is more volatile than a multi-year CAGR, so treat the AI's top pick as a recent
                momentum signal, not a guaranteed forward return.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info size={12} className="shrink-0" />
          <span>
            Return basis: {pct(fundReturn)}/yr{" "}
            {returnSource === "ai" && "(from AI forecast above)"}
            {returnSource === "historical" && "(11-yr historical CAGR — generate the AI forecast above for an updated estimate)"}
            {returnSource === "ai-research" && "(AI-researched YoY return — see sources below)"}
            {returnSource === "manual" && "(manually entered)"}
          </span>
        </div>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Total Invested</div>
              <div className="text-xl font-bold tabular-nums">{thb(totalInvested)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Projected Value</div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">{thb(futureValue)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Investment ROI</div>
              <div className={cn(
                "text-xl font-bold tabular-nums",
                roiPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
              )}>
                {roiPct >= 0 ? "+" : ""}{pct(roiPct)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Est. Tax Relief (total)</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{thb(totalTaxRelief)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-blue-200 dark:border-blue-800/50">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                Combined Benefit (growth + tax relief)
              </div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">{thb(combinedBenefit)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Effective ROI</div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                +{pct(combinedRoiPct)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Chart ───────────────────────────────────────────────────────── */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Invested vs Projected Value vs Tax Relief Over Time
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" height={36} tick={<YearAgeTick birthYear={birthYear} />} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number, name: string) => [
                thb(v),
                name === "value" ? "Projected value" : name === "invested" ? "Total invested" : "Cumulative tax relief",
              ]} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
              <Area type="monotone" dataKey="invested" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeWidth={1.5} />
              <Line type="monotone" dataKey="taxRelief" stroke="#10b981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Projected value
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" /> Total invested
            </span>
            <span className="flex items-center gap-1">
              <span className="w-8 border-t-2 border-emerald-500 inline-block" /> Cumulative tax relief
            </span>
            {birthYear && <span>· age shown is the profile owner's projected age each year</span>}
          </div>
        </div>

        {/* ── Save / load scenarios ───────────────────────────────────────── */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder={`e.g. "${fundLabel} · ฿${monthlyAmount.toLocaleString()}/mo · ${years}y"`}
              className="max-w-xs"
            />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={!userId}>
              <Save size={13} />
              Save this scenario
            </Button>
            <InfoTooltip content="Saves the current fund, monthly amount, years, tax bracket, and computed results as a named entry below — for comparing assumptions side by side. Stored only for this session (sessionStorage), cleared on logout." />
          </div>

          {savedScenarios.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {savedScenarios.map(s => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleLoad(s)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleLoad(s);
                    }
                  }}
                  title="Click to load this saved assumption"
                  className="flex items-center justify-between gap-3 text-xs bg-muted/40 hover:bg-muted/70 rounded-md px-3 py-2 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen size={12} className="text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {s.fundLabel} · ฿{s.monthlyAmount.toLocaleString()}/mo · {s.years}y · {(s.taxBracket * 100).toFixed(0)}% bracket
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                      {thb(s.results.futureValue - s.results.totalInvested + s.results.totalTaxRelief)}
                    </span>
                    <span className="hover:underline text-blue-600 dark:text-blue-400">Load</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleRemove(s.id);
                      }}
                      className="p-1 hover:bg-destructive/10 rounded-md"
                      title="Remove this saved scenario"
                    >
                      <Trash2 size={12} className="text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── AI fund sources / usage ─────────────────────────────────────── */}
        {aiFunds && aiFundsSources.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Sources: {aiFundsSources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ", "}
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline text-blue-600 dark:text-blue-400">{s.title}</a>
              </span>
            ))}
          </div>
        )}
        {aiFundsUsage && (
          <TokenUsageStamp
            inputTokens={aiFundsUsage.inputTokens}
            outputTokens={aiFundsUsage.outputTokens}
            remainingTokens={null}
            tokenLimit={null}
          />
        )}

        {/* ── Assumptions ─────────────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground italic">
          Assumes a constant monthly contribution compounded at a constant annual return — markets don't
          actually move this smoothly, so treat this as a directional estimate, not a guarantee.
          Tax relief assumes the full annual contribution qualifies as an RMF deduction (≤30% of assessable
          income, ≤฿500,000 combined with PVD/SSF) at your selected marginal rate; it is not itself reinvested.
          <span className="flex items-center gap-1 mt-1">
            <TrendingUp size={11} />
            For reference, the 35% bracket starts above ฿5,000,000 taxable income (Thai PIT table).
          </span>
        </p>
      </CardContent>
      )}
    </Card>
  );
}
