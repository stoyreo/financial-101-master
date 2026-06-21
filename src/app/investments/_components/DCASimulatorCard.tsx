"use client";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Calculator, TrendingUp, Info } from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardContent, NumberInput, Select, Label, Badge,
} from "@/components/ui";
import { cn, pct, thb } from "@/lib/utils";
import { PVDMPFEQ, SCBGOLDHRMF, geometricMean } from "@/lib/fund-registry";

// ── Types ─────────────────────────────────────────────────────────────────────

type FundChoice = "PVDMPFEQ" | "SCBGOLDHRMF" | "custom";

interface Props {
  /** AI best-estimate return for PVDMPFEQ, if a forecast has been generated */
  aiPVDReturn?: number;
  /** AI best-estimate return for SCBGOLDHRMF, if a forecast has been generated */
  aiSCBGoldReturn?: number;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function DCASimulatorCard({ aiPVDReturn, aiSCBGoldReturn }: Props) {
  const [fundChoice, setFundChoice] = useState<FundChoice>("PVDMPFEQ");
  const [monthlyAmount, setMonthlyAmount] = useState(5000);
  const [years, setYears] = useState(15);
  const [customRate, setCustomRate] = useState(7); // % — only used when fundChoice === "custom"
  const [taxBracket, setTaxBracket] = useState(0.10);

  const fundReturn = useMemo(() => {
    if (fundChoice === "PVDMPFEQ") {
      return aiPVDReturn ?? geometricMean(PVDMPFEQ) / 100;
    }
    if (fundChoice === "SCBGOLDHRMF") {
      return aiSCBGoldReturn ?? geometricMean(SCBGOLDHRMF) / 100;
    }
    return customRate / 100;
  }, [fundChoice, aiPVDReturn, aiSCBGoldReturn, customRate]);

  const returnSource = useMemo(() => {
    if (fundChoice === "PVDMPFEQ") return aiPVDReturn !== undefined ? "ai" : "historical";
    if (fundChoice === "SCBGOLDHRMF") return aiSCBGoldReturn !== undefined ? "ai" : "historical";
    return "manual";
  }, [fundChoice, aiPVDReturn, aiSCBGoldReturn]);

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

  // Year-by-year chart data
  const chartData = useMemo(() => {
    return Array.from({ length: years + 1 }, (_, yr) => {
      const m = yr * 12;
      const invested = monthlyAmount * m;
      const value = fvOfMonthlyDCA(monthlyAmount, fundReturn, m);
      return {
        year: new Date().getFullYear() + yr,
        invested: Math.round(invested),
        value: Math.round(value),
      };
    });
  }, [years, monthlyAmount, fundReturn]);

  return (
    <Card className="mb-6 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
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

      <CardContent className="space-y-4 pt-0">
        {/* ── Inputs ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Fund / Return Basis</Label>
            <Select value={fundChoice} onChange={e => setFundChoice(e.target.value as FundChoice)} className="mt-1">
              <option value="PVDMPFEQ">PVDMPFEQ (Thai equity)</option>
              <option value="SCBGOLDHRMF">SCBGOLDHRMF (Gold)</option>
              <option value="custom">Custom rate</option>
            </Select>
          </div>
          <div>
            <Label>Monthly DCA (฿)</Label>
            <NumberInput value={monthlyAmount} onChange={setMonthlyAmount} min={0} step={500} className="mt-1" />
          </div>
          <div>
            <Label>Years</Label>
            <NumberInput value={years} onChange={v => setYears(Math.max(1, Math.min(50, v)))} min={1} max={50} step={1} className="mt-1" />
          </div>
          <div>
            <Label>Your Tax Bracket</Label>
            <Select value={String(taxBracket)} onChange={e => setTaxBracket(parseFloat(e.target.value))} className="mt-1">
              {TAX_BRACKETS.map(b => (
                <option key={b} value={b}>{(b * 100).toFixed(0)}%</option>
              ))}
            </Select>
          </div>
        </div>

        {fundChoice === "custom" && (
          <div className="w-full sm:w-1/4">
            <Label>Assumed Annual Return (%)</Label>
            <NumberInput value={customRate} onChange={setCustomRate} step={0.5} className="mt-1" />
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info size={12} className="shrink-0" />
          <span>
            Return basis: {pct(fundReturn)}/yr{" "}
            {returnSource === "ai" && "(from AI forecast above)"}
            {returnSource === "historical" && "(11-yr historical CAGR — generate the AI forecast above for an updated estimate)"}
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
            Invested vs Projected Value Over Time
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number, name: string) => [thb(v), name === "value" ? "Projected value" : "Total invested"]} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
              <Area type="monotone" dataKey="invested" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Projected value
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" /> Total invested
            </span>
          </div>
        </div>

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
    </Card>
  );
}
