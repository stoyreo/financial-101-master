"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Switch, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RotateCcw, Save, ChevronDown, ChevronUp } from "lucide-react";
import type { ScenarioOverride } from "./snapshots";
import type { AccountInput } from "@/lib/engine/projection";

type PresetVectors = {
  bull: { label: string; shifts: Record<string, number> };
  bear: { label: string; shifts: Record<string, number> };
  recession: { label: string; shifts: Record<string, number> };
};

type LeverPanelProps = {
  accounts: AccountInput[];
  overrides: ScenarioOverride[];
  horizonYears: number;
  inflationPct: number;
  applyTaxDrag: boolean;
  taxDragPct: number;
  monteCarloEnabled: boolean;
  monteCarloVolPct: number;
  presetVectors: PresetVectors | null;
  activePreset: string;
  onOverrideChange: (accountId: string, field: keyof ScenarioOverride, value: number | undefined) => void;
  onHorizonChange: (years: number) => void;
  onInflationChange: (pct: number) => void;
  onTaxDragChange: (enabled: boolean) => void;
  onMonteCarloChange: (enabled: boolean) => void;
  onPresetApply: (preset: "base" | "bull" | "bear" | "recession") => void;
  onReset: () => void;
  onSaveSnapshot: () => void;
};

const HORIZON_OPTIONS = [5, 10, 15, 20, 25, 30, 40];

export function LeverPanel({
  accounts,
  overrides,
  horizonYears,
  inflationPct,
  applyTaxDrag,
  monteCarloEnabled,
  presetVectors,
  activePreset,
  onOverrideChange,
  onHorizonChange,
  onInflationChange,
  onTaxDragChange,
  onMonteCarloChange,
  onPresetApply,
  onReset,
  onSaveSnapshot,
}: LeverPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const getOverride = (accountId: string): ScenarioOverride | undefined =>
    overrides.find(o => o.accountId === accountId);

  const presetBtns = [
    { id: "base" as const, label: "Base", color: "outline" as const },
    { id: "bull" as const, label: presetVectors?.bull.label ?? "Bull", color: "outline" as const },
    { id: "bear" as const, label: presetVectors?.bear.label ?? "Bear", color: "outline" as const },
    { id: "recession" as const, label: presetVectors?.recession.label ?? "Recession", color: "outline" as const },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            What-If Levers
            <Badge variant={activePreset !== "base" && activePreset !== "custom" ? "warning" : "outline"}>
              {activePreset === "base" ? "Base" : activePreset === "custom" ? "Custom" : activePreset.charAt(0).toUpperCase() + activePreset.slice(1)}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={onReset} title="Reset to base">
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button size="sm" variant="outline" onClick={onSaveSnapshot} title="Save snapshot">
              <Save size={13} />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 hover:bg-accent rounded-md">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 pt-0">
          {/* Scenario presets */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Scenario Preset</div>
            <div className="flex flex-wrap gap-2">
              {presetBtns.map(p => (
                <button
                  key={p.id}
                  onClick={() => onPresetApply(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                    activePreset === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-foreground hover:bg-accent"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time horizon */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">Time Horizon</div>
              <span className="text-sm font-bold tabular-nums">{horizonYears} yr</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {HORIZON_OPTIONS.map(y => (
                <button
                  key={y}
                  onClick={() => onHorizonChange(y)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium border transition-colors min-w-[40px]",
                    horizonYears === y
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles row */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={inflationPct > 0}
                onCheckedChange={v => onInflationChange(v ? 0.03 : 0)}
              />
              <div>
                <div className="text-xs font-medium">Inflation adjust</div>
                <div className="text-xs text-muted-foreground">
                  {inflationPct > 0 ? `Real returns (−${(inflationPct * 100).toFixed(0)}%)` : "Nominal"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={applyTaxDrag} onCheckedChange={onTaxDragChange} />
              <div>
                <div className="text-xs font-medium">Tax drag (15%)</div>
                <div className="text-xs text-muted-foreground">Non-tax-advantaged only</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={monteCarloEnabled} onCheckedChange={onMonteCarloChange} />
              <div>
                <div className="text-xs font-medium">Monte Carlo</div>
                <div className="text-xs text-muted-foreground">P10/P50/P90 cone</div>
              </div>
            </div>
          </div>

          {/* Per-account sliders */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-3">Per-Account Levers</div>
            <div className="space-y-4">
              {accounts.map(acc => {
                const ov = getOverride(acc.id);
                const returnVal = ov?.returnPctOverride !== undefined
                  ? ov.returnPctOverride
                  : acc.expectedAnnualReturn;
                const contribVal = ov?.monthlyContribOverride !== undefined
                  ? ov.monthlyContribOverride
                  : acc.monthlyContribution;

                const returnDelta = returnVal - acc.expectedAnnualReturn;
                const contribDelta = contribVal - acc.monthlyContribution;

                return (
                  <div key={acc.id} className="border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium truncate max-w-48">{acc.name}</div>
                      <div className="flex items-center gap-1.5">
                        {acc.isTaxAdvantaged && (
                          <Badge variant="success" className="text-xs">Tax-adv</Badge>
                        )}
                        {(ov?.returnPctOverride !== undefined || ov?.monthlyContribOverride !== undefined) && (
                          <button
                            onClick={() => {
                              onOverrideChange(acc.id, "returnPctOverride", undefined);
                              onOverrideChange(acc.id, "monthlyContribOverride", undefined);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Return slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Annual Return</span>
                        <span className={cn(
                          "text-xs font-bold tabular-nums",
                          returnDelta > 0 ? "text-emerald-600" : returnDelta < 0 ? "text-red-500" : "text-foreground"
                        )}>
                          {(returnVal * 100).toFixed(1)}%
                          {returnDelta !== 0 && (
                            <span className="ml-1 font-normal">
                              ({returnDelta > 0 ? "+" : ""}{(returnDelta * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-5}
                        max={20}
                        step={0.5}
                        value={Math.round(returnVal * 200) / 2}
                        onChange={e => onOverrideChange(acc.id, "returnPctOverride", Number(e.target.value) / 100)}
                        className="w-full h-1.5 accent-primary cursor-pointer"
                        style={{ touchAction: "none" }}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span>−5%</span><span>Base: {(acc.expectedAnnualReturn * 100).toFixed(1)}%</span><span>+20%</span>
                      </div>
                    </div>

                    {/* Contribution slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Monthly Contrib</span>
                        <span className={cn(
                          "text-xs font-bold tabular-nums",
                          contribDelta > 0 ? "text-emerald-600" : contribDelta < 0 ? "text-red-500" : "text-foreground"
                        )}>
                          ฿{contribVal.toLocaleString()}
                          {contribDelta !== 0 && (
                            <span className="ml-1 font-normal">
                              ({contribDelta > 0 ? "+" : ""}฿{contribDelta.toLocaleString()})
                            </span>
                          )}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(acc.monthlyContribution * 3, 30000)}
                        step={500}
                        value={contribVal}
                        onChange={e => onOverrideChange(acc.id, "monthlyContribOverride", Number(e.target.value))}
                        className="w-full h-1.5 accent-primary cursor-pointer"
                        style={{ touchAction: "none" }}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span>฿0</span>
                        <span>Base: ฿{acc.monthlyContribution.toLocaleString()}</span>
                        <span>฿{Math.max(acc.monthlyContribution * 3, 30000).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
