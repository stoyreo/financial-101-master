"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { thb } from "@/lib/utils";

type DiffChartProps = {
  basePortfolio: number[];      // series of length horizonYears+1
  scenarioPortfolio: number[];
  horizonYears: number;
};

export function ScenarioDiffChart({ basePortfolio, scenarioPortfolio, horizonYears }: DiffChartProps) {
  const currentYear = new Date().getFullYear();

  // Show every 5 years + final year, max ~10 points
  const step = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const indices = Array.from({ length: horizonYears + 1 }, (_, i) => i)
    .filter(i => i % step === 0 || i === horizonYears);

  const data = indices.map(yr => {
    const base = basePortfolio[yr] ?? 0;
    const scen = scenarioPortfolio[yr] ?? 0;
    const delta = scen - base;
    return {
      year: currentYear + yr,
      base: Math.round(base / 1000),
      scenario: Math.round(scen / 1000),
      delta: Math.round(delta / 1000),
      isPositive: delta >= 0,
    };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.base, d.scenario)));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = data.find(r => r.year === label);
    if (!d) return null;
    const delta = d.scenario - d.base;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs">
        <div className="font-semibold mb-1.5">{label}</div>
        <div className="space-y-1">
          <div className="flex items-center gap-3 justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-blue-400" />Base
            </span>
            <span className="font-medium tabular-nums">{thb(d.base * 1000)}</span>
          </div>
          <div className="flex items-center gap-3 justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-violet-500" />Scenario
            </span>
            <span className="font-medium tabular-nums">{thb(d.scenario * 1000)}</span>
          </div>
          <div className="border-t border-border pt-1 flex items-center gap-3 justify-between">
            <span className="text-muted-foreground">Delta</span>
            <span className={`font-bold tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {delta >= 0 ? "+" : ""}{thb(delta * 1000)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={2} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 10 }} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={v => `${v >= 1000 ? `${(v / 1000).toFixed(0)}B` : `${v}K`}`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="var(--border)" />

        <Bar dataKey="base" name="Base" radius={[3, 3, 0, 0]} fill="#93c5fd">
          {data.map((_, i) => (
            <Cell key={i} fill="#93c5fd" />
          ))}
        </Bar>
        <Bar dataKey="scenario" name="Scenario" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.isPositive ? "#8b5cf6" : "#ef4444"}
              opacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
