"use client";
import { thb, pct } from "@/lib/utils";
import type { InvestmentAccount } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent, Progress } from "@/components/ui";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16"];

/**
 * PortfolioCharts — composition pie + 20-year projection, with the retirement
 * readiness gauge folded into the projection card (it's one line + a bar, it
 * doesn't need its own card).
 */
export function PortfolioCharts({
  activeInvestments,
  totalValue,
  retirementTarget,
  safeWithdrawalRate,
}: {
  activeInvestments: InvestmentAccount[];
  totalValue: number;
  retirementTarget: number;
  safeWithdrawalRate: number;
}) {
  // Projection: compound growth per account for 20 years (stacked by account)
  const projectionData = Array.from({ length: 21 }, (_, yr) => {
    const row: Record<string, any> = { year: new Date().getFullYear() + yr };
    let total = 0;
    activeInvestments.forEach(inv => {
      const contrib = inv.monthlyContribution * 12 + inv.annualContribution;
      const r = inv.expectedAnnualReturn;
      const projected = inv.marketValue * Math.pow(1 + r, yr)
        + (r > 0 ? contrib * (Math.pow(1 + r, yr) - 1) / r : contrib * yr);
      const value = Math.round(projected);
      row[inv.name] = value;
      total += value;
    });
    row._total = total;
    return row;
  });

  const pieData = activeInvestments.map(i => ({ name: i.name, value: i.marketValue }));
  const retirementProgress = Math.min(100, totalValue / (retirementTarget || 1) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">Portfolio Composition</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => thb(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {activeInvestments.map((inv, i) => (
              <div key={inv.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground truncate max-w-24">{inv.name}</span>
                </div>
                <span className="font-medium tabular-nums">{thb(inv.marketValue)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-sm">20-Year Growth Projection</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  return (
                    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs">
                      <div className="font-semibold text-foreground mb-1.5">{label}</div>
                      <div className="font-bold text-foreground mb-1">Total: {thb(total)}</div>
                      <div className="space-y-0.5">
                        {payload.reverse().map((p, i) => (
                          <div key={i} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                              <span className="text-muted-foreground truncate max-w-28">{p.dataKey}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium tabular-nums">{thb(Number(p.value))}</span>
                              <span className="text-muted-foreground tabular-nums w-10 text-right">
                                {total > 0 ? `${((Number(p.value) / total) * 100).toFixed(0)}%` : "0%"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              {activeInvestments.map((inv, i) => (
                <Bar
                  key={inv.id}
                  dataKey={inv.name}
                  stackId="portfolio"
                  fill={COLORS[i % COLORS.length]}
                  radius={i === activeInvestments.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 mb-1">
            {activeInvestments.map((inv, i) => (
              <div key={inv.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate max-w-28">{inv.name}</span>
              </div>
            ))}
          </div>
          <div className="p-2 bg-muted rounded-lg text-xs text-muted-foreground">
            Projection assumes constant contributions and expected returns per account. Does not adjust for inflation.
          </div>

          {/* Retirement readiness — merged from its own card */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm mb-1.5">
              <span className="font-medium">Retirement readiness</span>
              <span className="text-xs text-muted-foreground">
                Target {thb(retirementTarget)} at {pct(safeWithdrawalRate)} SWR
              </span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress to goal</span>
              <span className="font-medium tabular-nums">{retirementProgress.toFixed(1)}%</span>
            </div>
            <Progress value={retirementProgress} color="bg-emerald-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
