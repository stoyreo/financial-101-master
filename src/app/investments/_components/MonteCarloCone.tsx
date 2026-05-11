"use client";
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart,
} from "recharts";
import { thb } from "@/lib/utils";
import type { MonteCarloBands } from "@/lib/engine/projection";

type MonteCarloConeProps = {
  bands: MonteCarloBands;
  horizonYears: number;
};

export function MonteCarloCone({ bands, horizonYears }: MonteCarloConeProps) {
  const currentYear = new Date().getFullYear();
  const step = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const indices = Array.from({ length: horizonYears + 1 }, (_, i) => i)
    .filter(i => i % step === 0 || i === horizonYears);

  const data = indices.map(yr => ({
    year: currentYear + yr,
    p10: bands.p10[yr] ?? 0,
    p50: bands.p50[yr] ?? 0,
    p90: bands.p90[yr] ?? 0,
    // recharts area from p10 to p90: encode as [p10, p90]
    band: [bands.p10[yr] ?? 0, bands.p90[yr] ?? 0],
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = data.find(d => d.year === label);
    if (!row) return null;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs">
        <div className="font-semibold mb-1.5">{label}</div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-emerald-600">P90 (optimistic)</span>
            <span className="font-medium tabular-nums">{thb(row.p90)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-blue-500">P50 (median)</span>
            <span className="font-medium tabular-nums">{thb(row.p50)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-amber-500">P10 (pessimistic)</span>
            <span className="font-medium tabular-nums">{thb(row.p10)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block bg-violet-200 opacity-60" />
          P10–P90 cone (500 runs)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block bg-violet-600" />
          P50 median
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Shaded P10–P90 band */}
          <Area
            type="monotone"
            dataKey="p90"
            stroke="none"
            fill="#8b5cf6"
            fillOpacity={0.15}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#ffffff"
            fillOpacity={1}
            dot={false}
          />
          {/* P50 median line */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={false}
          />
          {/* P10 boundary */}
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="3 2"
            dot={false}
          />
          {/* P90 boundary */}
          <Line
            type="monotone"
            dataKey="p90"
            stroke="#10b981"
            strokeWidth={1}
            strokeDasharray="3 2"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
