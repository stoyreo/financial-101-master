"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { thb } from "@/lib/utils";
import type { InvestmentScenario } from "./snapshots";

type NamedSeries = {
  id: string;
  name: string;
  color: string;
  series: number[];
  visible: boolean;
};

type MultiScenarioLineProps = {
  currentYear: number;
  horizonYears: number;
  baseSeries: number[];
  scenarioSeries: number[];
  savedSnapshots: InvestmentScenario[];
  savedSnapshotSeries: Record<string, number[]>;
  hiddenIds: Set<string>;
  onToggleVisibility: (id: string) => void;
};

const SNAPSHOT_COLORS = ["#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#f97316"];

export function MultiScenarioLine({
  currentYear,
  horizonYears,
  baseSeries,
  scenarioSeries,
  savedSnapshots,
  savedSnapshotSeries,
  hiddenIds,
  onToggleVisibility,
}: MultiScenarioLineProps) {
  const step = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const indices = Array.from({ length: horizonYears + 1 }, (_, i) => i)
    .filter(i => i % step === 0 || i === horizonYears);

  const data = indices.map(yr => {
    const row: Record<string, any> = { year: currentYear + yr };
    row["Base"] = Math.round((baseSeries[yr] ?? 0));
    row["Scenario"] = Math.round((scenarioSeries[yr] ?? 0));
    savedSnapshots.slice(0, 4).forEach(s => {
      const ss = savedSnapshotSeries[s.id];
      if (ss) row[s.name] = Math.round(ss[yr] ?? 0);
    });
    return row;
  });

  const lines: NamedSeries[] = [
    { id: "base", name: "Base", color: "#93c5fd", series: baseSeries, visible: !hiddenIds.has("base") },
    { id: "scenario", name: "Scenario", color: "#8b5cf6", series: scenarioSeries, visible: !hiddenIds.has("scenario") },
    ...savedSnapshots.slice(0, 4).map((s, i) => ({
      id: s.id,
      name: s.name,
      color: SNAPSHOT_COLORS[i % SNAPSHOT_COLORS.length],
      series: savedSnapshotSeries[s.id] ?? [],
      visible: !hiddenIds.has(s.id),
    })),
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-36">
        <div className="font-semibold mb-1.5">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.dataKey}
            </span>
            <span className="font-medium tabular-nums">{thb(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const CustomLegend = () => (
    <div className="flex flex-wrap gap-2 justify-center mt-2">
      {lines.map(l => (
        <button
          key={l.id}
          onClick={() => onToggleVisibility(l.id)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-opacity ${
            l.visible ? "opacity-100" : "opacity-40"
          } hover:opacity-80 border-border`}
        >
          <span className="w-3 h-0.5 inline-block rounded" style={{ background: l.color }} />
          {l.name}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          {lines.map(l => (
            l.visible ? (
              <Line
                key={l.id}
                type="monotone"
                dataKey={l.name}
                stroke={l.color}
                strokeWidth={l.id === "scenario" ? 2.5 : 1.5}
                dot={false}
                strokeDasharray={l.id === "base" ? "4 2" : undefined}
              />
            ) : null
          ))}
        </LineChart>
      </ResponsiveContainer>
      <CustomLegend />
    </div>
  );
}
