"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore, selectTotalMonthlyExpenses, selectTotalMonthlyIncome } from "@/lib/store";
import { thb, toMonthly, pct } from "@/lib/utils";
import { computeIncomeTaxBreakdown, PVD_BASE_OFFSET } from "@/lib/engine/tax";
import { allTimeActualsByCategory, smartTopBudgetGaps, topTransactionsForGap, listMonths, ymLabel } from "@/lib/actuals";
import { getCurrentAccount } from "@/lib/accounts";
import type { ExpenseItem, Frequency } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, NumberInput, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Progress,
  InfoTooltip, AITokenMeter
} from "@/components/ui";
import { Plus, Edit, Trash2, ShoppingCart, Filter, Upload, Sparkles, Tag, X, Gauge, AlertTriangle, ArrowRight, PlusCircle, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const PVD_RATE = 0.10;

export const dynamic = "force-dynamic";

const DEFAULT_EXPENSE_CATEGORIES = ["Utilities","Food","Transport","Insurance","Housing","Entertainment","Shopping","Travel","Family","Pet","Health","Investment","Medical","Other"];
const FREQUENCIES: Frequency[] = ["monthly", "yearly", "one-time"];
const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"];

function defaultExpense(): Omit<ExpenseItem, "id"> {
  return {
    name: "", category: "Housing", amount: 0, frequency: "monthly",
    owner: "Me", startDate: new Date().toISOString().split("T")[0],
    inflationRate: 0.03, isEssential: true, notes: "", isActive: true,
  };
}

function ExpenseForm({ item, onChange, allCategories, onAddCategory }: {
  item: Omit<ExpenseItem, "id">;
  onChange: (k: string, v: any) => void;
  allCategories: string[];
  onAddCategory: (name: string) => boolean;
}) {
  const [newCat, setNewCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    setError(null);
    const ok = onAddCategory(newCat);
    if (!ok) {
      setError("Category exists or is empty.");
      return;
    }
    onChange("category", newCat.trim());
    setNewCat("");
    setAdding(false);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Name</Label>
        <Input value={item.name} onChange={e => onChange("name", e.target.value)} className="mt-1" placeholder="e.g. Monthly Rent" />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label>Category</Label>
        <div className="flex gap-1 mt-1">
          <Select
            value={item.category}
            onChange={e => {
              if (e.target.value === "__add__") { setAdding(true); return; }
              onChange("category", e.target.value);
            }}
            className="flex-1"
          >
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__add__">+ Add new category…</option>
          </Select>
          {!adding && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} title="Add new category">
              <Plus size={12} />
            </Button>
          )}
        </div>
        {adding && (
          <div className="flex items-center gap-1 mt-2">
            <Input
              autoFocus
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
              placeholder="e.g. Subscriptions, Education, Charity"
              className="text-sm"
            />
            <Button type="button" size="sm" onClick={handleAdd}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setNewCat(""); setError(null); }}>
              <X size={12} />
            </Button>
          </div>
        )}
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <div>
        <Label>Owner</Label>
        <Input value={item.owner} onChange={e => onChange("owner", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>Budget Amount (฿)</Label>
        <NumberInput value={item.amount} onChange={v => onChange("amount", v)} className="mt-1" />
      </div>
      <div>
        <Label>Frequency</Label>
        <Select value={item.frequency} onChange={e => onChange("frequency", e.target.value)} className="mt-1">
          {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
        </Select>
      </div>
      <div>
        <Label>Start Date</Label>
        <Input type="date" value={item.startDate} onChange={e => onChange("startDate", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>End Date (optional)</Label>
        <Input type="date" value={item.endDate ?? ""} onChange={e => onChange("endDate", e.target.value || undefined)} className="mt-1" />
      </div>
      <div>
        <Label>Inflation Rate</Label>
        <div className="relative mt-1">
          <NumberInput step="0.1" min={0} max={50}
            value={parseFloat((item.inflationRate * 100).toFixed(1))}
            onChange={v => onChange("inflationRate", v / 100)} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Label>Essential</Label>
        <Switch checked={item.isEssential} onCheckedChange={v => onChange("isEssential", v)} />
        <span className="text-sm text-muted-foreground">{item.isEssential ? "Essential" : "Discretionary"}</span>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Label>Active</Label>
        <Switch checked={item.isActive} onCheckedChange={v => onChange("isActive", v)} />
      </div>
      <div className="col-span-2">
        <Label>Notes</Label>
        <Textarea value={item.notes} onChange={e => onChange("notes", e.target.value)} className="mt-1" />
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const {
    expenses, addExpense, updateExpense, deleteExpense,
    customExpenseCategories, addExpenseCategory, removeExpenseCategory,
  } = useStore();
  const store = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<ExpenseItem, "id">>(defaultExpense());
  const [filterCat, setFilterCat] = useState("all");
  const [filterEssential, setFilterEssential] = useState<"all" | "essential" | "discretionary">("all");
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [expandedGap, setExpandedGap] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const allCategories = [
    ...DEFAULT_EXPENSE_CATEGORIES,
    ...((customExpenseCategories ?? []).filter(c => !DEFAULT_EXPENSE_CATEGORIES.includes(c))),
  ];

  const handleAddCategoryFromManager = () => {
    setCatError(null);
    const ok = addExpenseCategory(newCatName);
    if (!ok) {
      setCatError("Category exists or is empty.");
      return;
    }
    setNewCatName("");
  };

  const handleRemoveCategory = (name: string) => {
    if (expenses.some(e => e.category === name)) {
      alert(`Can't remove "${name}" — it's used by one or more expense items. Reassign them first.`);
      return;
    }
    if (confirm(`Remove category "${name}"?`)) {
      removeExpenseCategory(name);
    }
  };

  const totalMonthly = selectTotalMonthlyExpenses(store);
  const essentialMonthly = expenses.filter(e => e.isActive && e.isEssential)
    .reduce((s, e) => s + toMonthly(e.amount, e.frequency), 0);
  const discretionaryMonthly = totalMonthly - essentialMonthly;

  // ── Smart Analyzer: Income vs Actual Expense + top budget gaps ──
  const account = getCurrentAccount();
  const activeAccountId = account?.id;
  const transactions = store.transactions.filter(
    t => t.accountId === activeAccountId || !t.accountId
  );
  const months = listMonths(transactions);
  const monthCount = months.length;
  const hasActuals = monthCount > 0;
  const netMonthlyIncome = (() => {
    const b = computeIncomeTaxBreakdown(store.incomes, { pvdRate: PVD_RATE, pvdBaseOffset: PVD_BASE_OFFSET });
    return (b.grossAnnualIncome - b.estimatedTax - b.ssoDeduction - b.pvdDeduction) / 12;
  })();
  // Average monthly actual across ALL imported months/years.
  const allTimeTotals = allTimeActualsByCategory(transactions);
  const actualSpend = hasActuals
    ? Object.values(allTimeTotals).reduce((s, v) => s + v, 0) / monthCount
    : 0;
  const gaps = hasActuals ? smartTopBudgetGaps(expenses, transactions) : [];
  const totalGap = gaps.reduce((s, g) => s + g.gap, 0);
  const surplus = netMonthlyIncome - actualSpend;
  const savingsRate = netMonthlyIncome > 0 ? surplus / netMonthlyIncome : 0;

  const addGapToBudget = (category: string, monthlyAmount: number) => {
    setFormData({
      ...defaultExpense(),
      name: `${category} (from actuals)`,
      category,
      amount: Math.round(monthlyAmount),
      frequency: "monthly",
      isEssential: false,
    });
    setEditId(null);
    setModalOpen(true);
  };

  const openAdd = () => { setFormData(defaultExpense()); setEditId(null); setModalOpen(true); };
  const openEdit = (item: ExpenseItem) => { setFormData({ ...item }); setEditId(item.id); setModalOpen(true); };
  const handleSave = () => {
    if (!formData.name || formData.amount <= 0) return;
    if (editId) updateExpense(editId, formData);
    else addExpense(formData);
    setModalOpen(false);
  };
  const handleDelete = (id: string) => { if (confirm("Delete this expense?")) deleteExpense(id); };
  const setField = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

  // Category breakdown for chart
  const catBreakdown = (() => {
    const cats: Record<string, number> = {};
    for (const e of expenses.filter(e => e.isActive)) {
      cats[e.category] = (cats[e.category] ?? 0) + toMonthly(e.amount, e.frequency);
    }
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  })();

  const filtered = expenses
    .filter(e => filterCat === "all" || e.category === filterCat)
    .filter(e => filterEssential === "all" || (filterEssential === "essential" ? e.isEssential : !e.isEssential))
    .sort((a, b) => toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency));

  // Group budget items by category with a monthly subtotal, ranked by subtotal.
  const grouped = (() => {
    const map: Record<string, ExpenseItem[]> = {};
    for (const e of filtered) (map[e.category] ??= []).push(e);
    return Object.entries(map)
      .map(([category, items]) => ({
        category,
        items,
        subtotal: items.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0),
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  })();
  const toggleCat = (cat: string) => setCollapsedCats(s => ({ ...s, [cat]: !s[cat] }));
  const collapseAll = () => setCollapsedCats(Object.fromEntries(grouped.map(g => [g.category, true])));
  const expandAll = () => setCollapsedCats({});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Plan your monthly, yearly, and one-time budget with inflation"
        actions={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCatManagerOpen(true)}>
                <Tag size={14} /> Categories
              </Button>
              <Link href="/expenses/savings">
                <Button variant="outline" size="sm"><Sparkles size={14} /> Savings Optimizer</Button>
              </Link>
              <Link href="/expenses/actuals">
                <Button variant="outline" size="sm"><Upload size={14} /> Import Statement / Actuals</Button>
              </Link>
              <Button size="sm" onClick={openAdd}><Plus size={14} /> Add/Modify Budget</Button>
            </div>
            <AITokenMeter estimatedTokens={1500} label="expense analysis" />
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Total Monthly Budget"
          value={thb(totalMonthly)}
          icon={ShoppingCart}
          color="red"
          tooltip="Σ active expense items converted to monthly.\nYearly items ÷ 12."
        />
        <StatCard
          title="Annual Budget"
          value={thb(totalMonthly * 12)}
          icon={ShoppingCart}
          color="amber"
          tooltip="= Monthly Total × 12"
        />
        <StatCard
          title="Essential Budget"
          value={thb(essentialMonthly)}
          subtitle={pct(essentialMonthly / (totalMonthly || 1))}
          icon={ShoppingCart}
          color="blue"
          tooltip="Count of expense items where isActive = true."
        />
        <StatCard
          title="Discretionary Budget"
          value={thb(discretionaryMonthly)}
          subtitle={pct(discretionaryMonthly / (totalMonthly || 1))}
          icon={ShoppingCart}
          color="purple"
          tooltip="Count of expense items where isActive = true."
        />
      </div>

      {/* Smart Analyzer */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge size={15} /> Smart Analyzer — Income vs Actual Expense
            </CardTitle>
            {hasActuals && (
              <Badge variant="outline">
                {monthCount} month{monthCount > 1 ? "s" : ""} · {ymLabel(months[0])}–{ymLabel(months[months.length - 1])}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasActuals ? (
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/40">
              <div className="text-sm text-muted-foreground">
                No actual spending imported yet. Import a statement to compare real spend against your budget and surface gaps.
              </div>
              <Link href="/expenses/actuals">
                <Button size="sm" variant="outline"><Upload size={14} /> Import Statement</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <div className="text-xs text-emerald-700 dark:text-emerald-300">Net Income (take-home)</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{thb(netMonthlyIncome)}</div>
                  <div className="text-[11px] text-muted-foreground">per month</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <div className="text-xs text-red-700 dark:text-red-300">Actual Spend</div>
                  <div className="text-lg font-bold tabular-nums text-red-800 dark:text-red-200">{thb(actualSpend)}</div>
                  <div className="text-[11px] text-muted-foreground">avg/mo · {monthCount} mo</div>
                </div>
                <div className={`p-3 rounded-lg ${surplus >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-amber-50 dark:bg-amber-900/20"}`}>
                  <div className="text-xs text-muted-foreground">{surplus >= 0 ? "Surplus" : "Deficit"}</div>
                  <div className={`text-lg font-bold tabular-nums ${surplus >= 0 ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300"}`}>{thb(surplus)}</div>
                  <div className="text-[11px] text-muted-foreground">income − actual</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Savings Rate</div>
                  <div className="text-lg font-bold tabular-nums">{pct(savingsRate)}</div>
                  <div className="text-[11px] text-muted-foreground">of net income</div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-500" />
                  Top expensive gaps to consider budgeting
                </div>
                {totalGap > 0 && <span className="text-xs text-muted-foreground">Unbudgeted/over by {thb(totalGap)}/mo</span>}
              </div>

              {gaps.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-sm text-emerald-800 dark:text-emerald-200">
                  No gaps — every category with actual spend is within its budget. Nice.
                </div>
              ) : (
                <div className="space-y-2">
                  {gaps.map(g => {
                    const gapKey = `${g.category}::${g.matchedItemName ?? "unmatched"}`;
                    const open = expandedGap === gapKey;
                    const examples = open ? topTransactionsForGap(transactions, expenses, g) : [];
                    return (
                      <div key={gapKey} className="rounded-lg border border-border overflow-hidden transition-colors">
                        <div
                          className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedGap(open ? null : gapKey)}
                        >
                          <ChevronRight
                            size={15}
                            className={`text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {g.matchedItemName ?? g.category}
                              </span>
                              {g.matchedItemName && (
                                <span className="text-xs text-muted-foreground truncate">({g.category})</span>
                              )}
                              <Badge variant={g.unbudgeted ? "warning" : "outline"}>
                                {g.unbudgeted ? "No matching budget item" : "Over its own budget"}
                              </Badge>
                              {!g.isEssential && <Badge variant="outline">Discretionary</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                              {g.matchedItemName && (
                                <span className="text-emerald-600 dark:text-emerald-400 mr-2">✓ matched to existing budget line</span>
                              )}
                              Actual {thb(g.actual)}/mo
                              <ArrowRight size={10} className="inline mx-1" />
                              Budget {thb(g.budget)}/mo
                              <span className="text-amber-600 dark:text-amber-400 font-medium ml-2">gap {thb(g.gap)}</span>
                            </div>
                          </div>
                          <Button
                            size="sm" variant="outline"
                            onClick={e => { e.stopPropagation(); addGapToBudget(g.category, g.suggestedBudget); }}
                          >
                            <PlusCircle size={14} /> Budget {thb(g.suggestedBudget)}
                          </Button>
                        </div>
                        <div
                          className="grid transition-all duration-300 ease-out"
                          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden">
                            <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                                {g.matchedItemName
                                  ? `Transactions matched to "${g.matchedItemName}"`
                                  : `Unmatched / unbudgeted records in ${g.category}`}
                              </div>
                              {examples.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-1">No matching transactions.</div>
                              ) : (
                                <div className="space-y-1">
                                  {examples.map((t, i) => (
                                    <div
                                      key={t.id}
                                      className="flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1"
                                      style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                                    >
                                      <div className="min-w-0 flex-1 truncate">
                                        <span className="text-muted-foreground">{ymLabel(t.billingMonth || t.postDate.slice(0, 7))}</span>
                                        <span className="mx-1.5">·</span>
                                        <span className="truncate">{t.description || t.merchantKey || "—"}</span>
                                      </div>
                                      <span className="tabular-nums font-medium shrink-0">{thb(t.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Gaps rank categories where actual spend exceeds the budget (or has none). “Budget” pre-fills a new line at the rounded actual — review and save to bring it into your plan.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Category chart */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={catBreakdown.slice(0, 8)} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {catBreakdown.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => thb(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {catBreakdown.slice(0, 5).map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-muted-foreground">{c.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{thb(c.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Essential vs Discretionary */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Essential vs Discretionary Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Essential ({pct(essentialMonthly / (totalMonthly || 1))})</span>
                <span className="font-medium tabular-nums">{thb(essentialMonthly)}/mo</span>
              </div>
              <Progress value={(essentialMonthly / (totalMonthly || 1)) * 100} color="bg-blue-500" />
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Discretionary ({pct(discretionaryMonthly / (totalMonthly || 1))})</span>
                <span className="font-medium tabular-nums">{thb(discretionaryMonthly)}/mo</span>
              </div>
              <Progress value={(discretionaryMonthly / (totalMonthly || 1)) * 100} color="bg-purple-500" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {catBreakdown.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                  </div>
                  <span className="font-medium tabular-nums ml-2">{thb(c.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={14} className="text-muted-foreground" />
        <Select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="w-40 h-8 text-xs">
          <option value="all">All Categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        {(["all", "essential", "discretionary"] as const).map(f => (
          <button key={f}
            onClick={() => setFilterEssential(f)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              filterEssential === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>Collapse All</Button>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
      </div>

      {/* Expense table */}
      {filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No expenses" description="Add expense items to track your spending." action={<Button onClick={openAdd}><Plus size={14} /> Add Expense</Button>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Name", "Category", "Budget", "Monthly Budget", "Inflation", "Essential", "Status", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              {grouped.map(group => {
                const collapsed = collapsedCats[group.category];
                return (
                  <tbody key={group.category}>
                    {/* Category subtotal header (click to collapse) */}
                    <tr
                      className="border-b border-border bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
                      onClick={() => toggleCat(group.category)}
                    >
                      <td colSpan={3} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <ChevronRight size={14} className={`text-muted-foreground transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`} />
                          <Badge variant="outline">{group.category}</Badge>
                          <span className="text-xs font-normal text-muted-foreground">
                            {group.items.length} item{group.items.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold tabular-nums">{thb(group.subtotal)}</td>
                      <td colSpan={4} className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {thb(group.subtotal * 12)}/yr subtotal
                      </td>
                    </tr>
                    {/* Items */}
                    {!collapsed && group.items.map((item, idx) => {
                      const monthly = toMonthly(item.amount, item.frequency);
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-border hover:bg-muted/30 transition-colors animate-in fade-in slide-in-from-top-1 duration-200"
                          style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}
                        >
                          <td className="px-4 py-3 pl-10">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.owner} · {item.frequency}</div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">{item.category}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="tabular-nums font-medium">{thb(item.amount)}</div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">{thb(monthly)}</td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{pct(item.inflationRate)}/yr</td>
                          <td className="px-4 py-3">
                            <Badge variant={item.isEssential ? "default" : "outline"}>
                              {item.isEssential ? "Essential" : "Discretionary"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={item.isActive ? "success" : "outline"}>{item.isActive ? "Active" : "Off"}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-accent rounded-md">
                                <Edit size={14} className="text-muted-foreground" />
                              </button>
                              <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-destructive/10 rounded-md">
                                <Trash2 size={14} className="text-destructive" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={3} className="px-4 py-3 font-semibold">TOTAL</td>
                  <td className="px-4 py-3 font-bold tabular-nums">{thb(totalMonthly)}/mo</td>
                  <td colSpan={4} className="px-4 py-3 text-xs text-muted-foreground">{thb(totalMonthly * 12)}/year</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Expense" : "Add Expense"} className="max-w-2xl">
        <ExpenseForm
          item={formData}
          onChange={setField}
          allCategories={allCategories}
          onAddCategory={addExpenseCategory}
        />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name || formData.amount <= 0}>Save</Button>
        </div>
      </Modal>

      {/* Category manager modal */}
      <Modal open={catManagerOpen} onClose={() => setCatManagerOpen(false)} title="Manage Expense Categories" className="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Built-in categories are always available. Add your own to track spending in custom buckets
            (e.g. Subscriptions, Education, Charity, Childcare).
          </p>

          <div>
            <Label>Add new category</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCategoryFromManager(); }}}
                placeholder="e.g. Subscriptions"
                className="text-sm flex-1"
              />
              <Button size="sm" onClick={handleAddCategoryFromManager} disabled={!newCatName.trim()}>
                <Plus size={12} /> Add
              </Button>
            </div>
            {catError && <p className="text-[11px] text-red-600 mt-1">{catError}</p>}
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Built-in
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DEFAULT_EXPENSE_CATEGORIES.map(c => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))}
            </div>
          </div>

          {(customExpenseCategories ?? []).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Custom ({(customExpenseCategories ?? []).length})
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(customExpenseCategories ?? []).map(c => {
                  const inUse = expenses.some(e => e.category === c);
                  return (
                    <span
                      key={c}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        inUse ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c}
                      <button
                        onClick={() => handleRemoveCategory(c)}
                        className="hover:bg-destructive/20 rounded-full p-0.5"
                        title={inUse ? `In use by ${expenses.filter(e => e.category === c).length} item(s) — reassign first` : "Remove category"}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setCatManagerOpen(false)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
