"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore, selectTotalMonthlyExpenses } from "@/lib/store";
import { thb, toMonthly, pct } from "@/lib/utils";
import type { ExpenseItem, Frequency } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Progress
} from "@/components/ui";
import { Plus, Edit, Trash2, ShoppingCart, Filter, Upload, Sparkles, Tag, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

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
        <Input type="number" value={item.amount} onChange={e => onChange("amount", Number(e.target.value))} className="mt-1" />
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
          <Input type="number" step="0.1" min={0} max={50}
            value={(item.inflationRate * 100).toFixed(1)}
            onChange={e => onChange("inflationRate", Number(e.target.value) / 100)} />
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Plan your monthly, yearly, and one-time budget with inflation"
        actions={
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
            <Button size="sm" onClick={openAdd}><Plus size={14} /> Add Expense</Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard title="Total Monthly Budget" value={thb(totalMonthly)} icon={ShoppingCart} color="red" />
        <StatCard title="Annual Budget"        value={thb(totalMonthly * 12)} icon={ShoppingCart} color="amber" />
        <StatCard title="Essential Budget"     value={thb(essentialMonthly)} subtitle={pct(essentialMonthly / (totalMonthly || 1))} icon={ShoppingCart} color="blue" />
        <StatCard title="Discretionary Budget" value={thb(discretionaryMonthly)} subtitle={pct(discretionaryMonthly / (totalMonthly || 1))} icon={ShoppingCart} color="purple" />
      </div>

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
              <tbody>
                {filtered.map(item => {
                  const monthly = toMonthly(item.amount, item.frequency);
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
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
