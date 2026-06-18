"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { thb, pct, effectiveIncomeAmount } from "@/lib/utils";
import { computeTax, compareTaxVsDebt, PVD_BASE_OFFSET } from "@/lib/engine/tax";
import type { TaxAssumptions } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  StatCard, PageHeader, Alert, Progress, Separator, Badge, InfoTooltip
} from "@/components/ui";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Calculator, Save, TrendingDown, CheckCircle, Download } from "lucide-react";

const PVD_RATE = 0.10; // employee provident-fund rate, matches Income page

export default function TaxPage() {
  const { tax, setTax, debts, incomes } = useStore();
  const [form, setForm] = useState<TaxAssumptions>({ ...tax });
  const [saved, setSaved] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Pull gross income, bonus, PVD and employment deduction from the Income menu.
  const prefillFromIncome = () => {
    const annual = (i: typeof incomes[number]) => {
      const amount = effectiveIncomeAmount(i);
      return i.frequency === "yearly" ? amount : i.frequency === "monthly" ? amount * 12 : 0;
    };
    const active = incomes.filter(i => i.isActive && i.isTaxable);
    const salaryOnly = active.filter(i => i.category === "salary").reduce((s, i) => s + annual(i), 0);
    const employment = active
      .filter(i => i.category === "salary" || i.category === "freelance")
      .reduce((s, i) => s + annual(i), 0);
    const bonus = active.filter(i => i.category === "bonus").reduce((s, i) => s + annual(i), 0);
    const pvd = Math.min(Math.max(0, salaryOnly - PVD_BASE_OFFSET) * PVD_RATE, 500_000);

    setForm(f => ({
      ...f,
      annualGrossIncome: Math.round(employment),
      annualBonus: Math.round(bonus),
      pvdContribution: Math.round(pvd),
      employmentIncomeDeduction: Math.min((employment + bonus) * 0.5, 100_000),
    }));
    setPrefilled(true);
    setTimeout(() => setPrefilled(false), 3000);
  };

  const result = computeTax(form);
  const mortgage = debts.find(d => d.debtType === "mortgage" && d.isActive);

  const debtVsTaxComparison = mortgage
    ? compareTaxVsDebt({
        tax: form,
        extraAmount: 60_000,
        debtInterestRate: mortgage.annualInterestRate,
      })
    : null;

  const handleSave = () => { setTax(form); setSaved(true); setTimeout(() => setSaved(false), 3000); };
  const field = (key: keyof TaxAssumptions) => ({
    value: String(form[key] ?? 0),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: Number(e.target.value) })),
    type: "number" as const,
  });

  const bracketData = [
    { range: "0–150K", rate: 0, taxable: Math.min(150_000, result.taxableIncome) },
    { range: "150–300K", rate: 5, taxable: Math.max(0, Math.min(150_000, result.taxableIncome - 150_000)) },
    { range: "300–500K", rate: 10, taxable: Math.max(0, Math.min(200_000, result.taxableIncome - 300_000)) },
    { range: "500–750K", rate: 15, taxable: Math.max(0, Math.min(250_000, result.taxableIncome - 500_000)) },
    { range: "750K–1M", rate: 20, taxable: Math.max(0, Math.min(250_000, result.taxableIncome - 750_000)) },
    { range: "1–2M", rate: 25, taxable: Math.max(0, Math.min(1_000_000, result.taxableIncome - 1_000_000)) },
    { range: "2–5M", rate: 30, taxable: Math.max(0, Math.min(3_000_000, result.taxableIncome - 2_000_000)) },
  ].filter(b => b.taxable > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Tax Planning"
        subtitle="Thailand PIT estimation and deduction optimisation"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={prefillFromIncome}>
              <Download size={14} /> Prefill from Income
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save size={14} /> Save Assumptions
            </Button>
          </div>
        }
      />

      {prefilled && <Alert variant="success" className="mb-4"><CheckCircle size={14} className="inline mr-2" />Prefilled gross income, bonus, PVD and employment deduction from your Income menu. Review and click Save Assumptions to keep.</Alert>}
      {saved && <Alert variant="success" className="mb-4"><CheckCircle size={14} className="inline mr-2" />Tax assumptions saved.</Alert>}

      {/* Tax summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Gross Income"
          value={thb(result.grossIncome)}
          icon={Calculator}
          color="blue"
          tooltip="= Annual employment income + bonus + other taxable sources entered in Income menu."
        />
        <StatCard
          title="Total Deductions"
          value={thb(result.totalDeductions)}
          icon={TrendingDown}
          color="green"
          tooltip="Employment deduction (50%, max ฿100K) + personal allowance (฿60K) + RMF + SSF + PVD + insurance premiums + mortgage interest + dependant allowances."
        />
        <StatCard
          title="Taxable Income"
          value={thb(result.taxableIncome)}
          icon={Calculator}
          color="amber"
          tooltip="= Gross Income − Total Deductions\nProgressive bracket rates apply to this figure."
        />
        <StatCard
          title="Estimated Tax"
          value={thb(result.estimatedTax)}
          subtitle={`Effective rate: ${pct(result.effectiveTaxRate)}`}
          icon={Calculator}
          color="red"
          tooltip="Thai PIT progressive brackets:\n0–150K: 0%\n150–300K: 5%\n300–500K: 10%\n500–750K: 15%\n750K–1M: 20%\n1–2M: 25%\n2–5M: 30%\n\nEffective Rate = Total Tax ÷ Gross Income"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Inputs */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Income & Basic Deductions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Annual Gross Income (฿)</Label>
                <Input {...field("annualGrossIncome")} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Annual Bonus (฿)</Label>
                <Input {...field("annualBonus")} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Personal Allowance (฿)</Label>
                <Input {...field("personalDeduction")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Standard: 60,000</p>
              </div>
              <div>
                <Label className="text-xs">Employment Deduction (฿)</Label>
                <Input {...field("employmentIncomeDeduction")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">50% of income, max 100,000</p>
              </div>
              <div>
                <Label className="text-xs">Parental Deduction (฿)</Label>
                <Input {...field("parentalDeduction")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">30,000 per parent</p>
              </div>
              <div>
                <Label className="text-xs">Child Deduction (฿)</Label>
                <Input {...field("childDeduction")} className="mt-1 text-sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Investment & Insurance Deductions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">PVD Contribution (฿)</Label>
                <Input {...field("pvdContribution")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 15% of salary, 500K</p>
              </div>
              <div>
                <Label className="text-xs">RMF Contribution (฿)</Label>
                <Input {...field("rmfContribution")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 30% of income, 500K</p>
              </div>
              <div>
                <Label className="text-xs">SSF Contribution (฿)</Label>
                <Input {...field("ssfContribution")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 30%, 200K</p>
              </div>
              <div>
                <Label className="text-xs">Life Insurance (฿)</Label>
                <Input {...field("lifeInsurancePremium")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 100,000</p>
              </div>
              <div>
                <Label className="text-xs">Health Insurance (฿)</Label>
                <Input {...field("healthInsurancePremium")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 25,000</p>
              </div>
              <div>
                <Label className="text-xs">Mortgage Interest (฿)</Label>
                <Input {...field("mortgageInterestDeduction")} className="mt-1 text-sm" />
                <p className="text-xs text-muted-foreground mt-0.5">Max 100,000</p>
              </div>
              <div>
                <Label className="text-xs">Other Deductions (฿)</Label>
                <Input {...field("otherDeductions")} className="mt-1 text-sm" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Deduction breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Deduction Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Employment Deduction", value: result.employmentDeduction, max: 100_000 },
                { label: "Personal Allowance", value: result.personalAllowance, max: 60_000 },
                { label: "PVD", value: result.pvdDeduction, max: 500_000 },
                { label: "RMF", value: result.rmfDeduction, max: 500_000 },
                { label: "SSF", value: result.ssfDeduction, max: 200_000 },
                { label: "Life Insurance", value: result.lifeInsuranceDeduction, max: 100_000 },
                { label: "Health Insurance", value: result.healthInsuranceDeduction, max: 25_000 },
                { label: "Mortgage Interest", value: result.mortgageInterestDeduction, max: 100_000 },
                { label: "Parental", value: result.parentalDeduction, max: 60_000 },
                { label: "Other", value: result.otherDeductions, max: null },
              ].filter(d => d.value > 0).map(d => (
                <div key={d.label}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium tabular-nums">
                      {thb(d.value)}
                      {d.max && <span className="text-muted-foreground ml-1">/ {thb(d.max)}</span>}
                    </span>
                  </div>
                  {d.max && <Progress value={(d.value / d.max) * 100} className="h-1" color={d.value >= d.max ? "bg-emerald-500" : "bg-blue-400"} />}
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold text-sm">
                <span>Total Deductions</span>
                <span className="tabular-nums">{thb(result.totalDeductions)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tax bracket visualisation */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Tax Bracket Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bracketData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => thb(v)} />
                <Bar dataKey="taxable" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Income in Bracket" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxable Income</span>
                <span className="font-bold tabular-nums">{thb(result.taxableIncome)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated Tax</span>
                <span className="font-bold tabular-nums text-red-600">{thb(result.estimatedTax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Effective Rate</span>
                <span className="font-bold tabular-nums">{pct(result.effectiveTaxRate)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Marginal Rate</span>
                <span className="font-bold tabular-nums text-amber-600">{pct(result.marginalRate)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planning insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Tax Savings Insights</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Tax Saved by RMF</div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{thb(result.taxSavedByRMF)}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">On {thb(result.rmfDeduction)} contribution</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200">Tax Saved by PVD</div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">{thb(result.taxSavedByPVD)}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">On {thb(result.pvdDeduction)} contribution</div>
            </div>
            {result.additionalRMFRoom > 0 && (
              <Alert variant="warning">
                <div className="text-xs">
                  <strong>RMF Room Available:</strong> You can contribute {thb(result.additionalRMFRoom)} more to RMF for additional tax savings.
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>

        {debtVsTaxComparison && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Strategy: Invest for Tax Relief vs Pay Down Debt</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">If you have ฿60,000 extra cash, should you invest in RMF (tax relief) or pay down your mortgage?</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <div className="text-xs text-muted-foreground mb-1">Invest in RMF</div>
                    <div className="text-lg font-bold tabular-nums text-emerald-600">{thb(debtVsTaxComparison.taxReliefBenefit)}</div>
                    <div className="text-xs text-muted-foreground">Tax saved</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <div className="text-xs text-muted-foreground mb-1">Pay Down Mortgage</div>
                    <div className="text-lg font-bold tabular-nums text-blue-600">{thb(debtVsTaxComparison.debtInterestSaving)}</div>
                    <div className="text-xs text-muted-foreground">Interest saved</div>
                  </div>
                </div>
                <div className={`p-3 rounded-lg text-sm font-medium text-center ${
                  debtVsTaxComparison.recommendation === "tax-relief"
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                    : "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
                }`}>
                  <CheckCircle size={14} className="inline mr-1" />
                  Recommendation: <strong>{debtVsTaxComparison.recommendation === "tax-relief" ? "Invest in RMF" : "Pay Down Debt"}</strong>
                </div>
                <div className="text-xs text-muted-foreground">{debtVsTaxComparison.reasoning}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
