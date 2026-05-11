"use client";
import { useState, useRef } from "react";
import { useStore, selectTotalMonthlyIncome } from "@/lib/store";
import { thb, toMonthly, pct } from "@/lib/utils";
import type { IncomeItem, IncomeCategory, Frequency } from "@/lib/types";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  Select, Switch, Textarea, Modal, Badge, StatCard, PageHeader, EmptyState, Alert,
  InfoTooltip, AITokenMeter, recordTokenUsage
} from "@/components/ui";
import { Plus, Edit, Trash2, TrendingUp, DollarSign, Briefcase, PiggyBank, FileUp } from "lucide-react";

const CATEGORIES: IncomeCategory[] = ["salary", "bonus", "freelance", "rental", "dividend", "interest", "other"];
const FREQUENCIES: Frequency[] = ["monthly", "yearly", "one-time"];
const CATEGORY_COLORS: Record<IncomeCategory, string> = {
  salary: "blue", bonus: "green", freelance: "amber", rental: "purple",
  dividend: "green", interest: "blue", other: "outline",
};

function defaultItem(): Omit<IncomeItem, "id"> {
  return {
    name: "", category: "salary", owner: "Me", frequency: "monthly",
    amount: 0, startDate: new Date().toISOString().split("T")[0],
    annualGrowthRate: 0.04, isTaxable: true, notes: "", isActive: true,
  };
}

function IncomeForm({ item, onChange }: { item: Omit<IncomeItem, "id">; onChange: (k: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Name</Label>
        <Input value={item.name} onChange={e => onChange("name", e.target.value)} className="mt-1" placeholder="e.g. Monthly Salary" />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={item.category} onChange={e => onChange("category", e.target.value)} className="mt-1">
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </Select>
      </div>
      <div>
        <Label>Owner</Label>
        <Input value={item.owner} onChange={e => onChange("owner", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>Frequency</Label>
        <Select value={item.frequency} onChange={e => onChange("frequency", e.target.value)} className="mt-1">
          {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
        </Select>
      </div>
      <div>
        <Label>Amount (฿)</Label>
        <Input type="number" value={item.amount} onChange={e => onChange("amount", Number(e.target.value))} className="mt-1" />
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
        <Label>Annual Growth Rate</Label>
        <div className="relative mt-1">
          <Input type="number" step="0.01" min={-0.5} max={1}
            value={(item.annualGrowthRate * 100).toFixed(1)}
            onChange={e => onChange("annualGrowthRate", Number(e.target.value) / 100)} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Label>Taxable</Label>
        <Switch checked={item.isTaxable} onCheckedChange={v => onChange("isTaxable", v)} />
        <span className="text-sm text-muted-foreground">{item.isTaxable ? "Taxable" : "Tax-exempt"}</span>
      </div>
      <div className="flex items-center gap-3 mt-4">
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

export default function IncomePage() {
  const { incomes, addIncome, updateIncome, deleteIncome } = useStore();
  const store = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<IncomeItem, "id">>(defaultItem());
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortField, setSortField] = useState<"amount" | "name">("amount");
  const [ocrBusy, setOcrBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalMonthly = selectTotalMonthlyIncome(store);
  const totalYearly = totalMonthly * 12;

  const openAdd = () => { setFormData(defaultItem()); setEditId(null); setModalOpen(true); };
  const openEdit = (item: IncomeItem) => {
    setFormData({ ...item }); setEditId(item.id); setModalOpen(true);
  };
  const handleSave = () => {
    if (!formData.name || formData.amount <= 0) return;
    if (editId) updateIncome(editId, formData);
    else addIncome(formData);
    setModalOpen(false);
  };
  const handleDelete = (id: string) => {
    if (confirm("Delete this income item?")) deleteIncome(id);
  };
  const setField = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

  const handlePayslipImport = async (file: File) => {
    setOcrBusy(true);
    try {
      // Safe base64 for files of any size — chunk to stay under the JS arg-count limit.
      // The previous `btoa(String.fromCharCode(...new Uint8Array(buf)))` blew up with
      // RangeError ("Maximum call stack size exceeded") on anything larger than ~100KB,
      // which is most real payslip PDFs and phone photos.
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      const CHUNK = 0x8000; // 32 KB
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + CHUNK) as unknown as number[]
        );
      }
      const b64 = btoa(bin);

      const res = await fetch("/api/payslip/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaType: file.type, data: b64 }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("payslip extract HTTP", res.status, detail);
        alert(`OCR failed (${res.status}). Try a clearer image.`);
        return;
      }
      const x = await res.json();
      recordTokenUsage(2500);
      if (!x.netAmount) {
        alert("Could not read net pay. Please add manually.");
        return;
      }
      setFormData({
        name: x.name || `${x.employer ?? "Employer"} payroll`,
        category: "salary",
        owner: "Me",
        frequency: x.isMonthly ? "monthly" : "one-time",
        amount: x.netAmount,
        startDate: x.periodStart || new Date().toISOString().split("T")[0],
        endDate: undefined,
        annualGrowthRate: 0.04,
        isTaxable: false,                      // already net
        notes: `Imported from payslip ${x.periodStart ?? ""}–${x.periodEnd ?? ""}. Confidence ${(x.confidence*100|0)}%. ${x.notes ?? ""}`,
        isActive: true,
      });
      setEditId(null);
      setModalOpen(true);
    } catch (e) {
      console.error("payslip import error:", e);
      alert(`Import error: ${(e as Error)?.message ?? e}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const filtered = incomes
    .filter(i => filterCategory === "all" || i.category === filterCategory)
    .sort((a, b) => sortField === "amount"
      ? toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency)
      : a.name.localeCompare(b.name));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Income"
        subtitle="Manage all income sources with growth projections"
        actions={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <label className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border
                               bg-card hover:bg-muted text-sm cursor-pointer ${ocrBusy ? "opacity-50 pointer-events-none" : ""}`}>
                <FileUp size={14} />
                {ocrBusy ? "Reading…" : "Import payslip"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePayslipImport(f); e.target.value=""; }}
                />
              </label>
              <Button size="sm" onClick={openAdd}>
                <Plus size={14} /> Add Income
              </Button>
            </div>
            <AITokenMeter estimatedTokens={2000} label="payslip OCR" />
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Total Monthly Income"
          value={thb(totalMonthly)}
          icon={TrendingUp}
          color="green"
          tooltip="Σ all active income items converted to monthly.\nYearly items ÷ 12. One-time items excluded."
        />
        <StatCard
          title="Total Annual Income"
          value={thb(totalYearly)}
          icon={DollarSign}
          color="blue"
          tooltip="= Total Monthly Income × 12"
        />
        <StatCard
          title="Active Sources"
          value={incomes.filter(i => i.isActive).length.toString()}
          icon={Briefcase}
          color="purple"
          tooltip="Count of income items where isActive = true."
        />
        <StatCard
          title="Taxable Portion"
          value={pct(incomes.filter(i => i.isActive && i.isTaxable)
            .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0) / (totalMonthly || 1))}
          icon={PiggyBank}
          color="amber"
          tooltip="= Σ(taxable items monthly) ÷ Total Monthly Income\n\nisTaxable=false: net payslip imports, tax-exempt dividends."
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", ...CATEGORIES].map(c => (
          <button key={c}
            onClick={() => setFilterCategory(c)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
              filterCategory === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Sort by:
          <button onClick={() => setSortField("amount")} className={`font-medium ${sortField === "amount" ? "text-primary" : ""}`}>Amount</button>
          <button onClick={() => setSortField("name")} className={`font-medium ${sortField === "name" ? "text-primary" : ""}`}>Name</button>
        </div>
      </div>

      {/* Income table */}
      {filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No income items" description="Add your salary, bonus, or other income sources to get started." action={<Button onClick={openAdd}><Plus size={14} /> Add Income</Button>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Name", "Category", "Frequency", "Amount", "Monthly", "Growth", "Taxable", "Status", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.owner}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CATEGORY_COLORS[item.category] as any}>{item.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.frequency}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{thb(item.amount)}</td>
                    <td className="px-4 py-3 tabular-nums">{thb(toMonthly(item.amount, item.frequency))}</td>
                    <td className="px-4 py-3 tabular-nums">{pct(item.annualGrowthRate)}/yr</td>
                    <td className="px-4 py-3">
                      <Badge variant={item.isTaxable ? "warning" : "success"}>{item.isTaxable ? "Taxable" : "Tax-free"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.isActive ? "success" : "outline"}>{item.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-accent rounded-md transition-colors">
                          <Edit size={14} className="text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors">
                          <Trash2 size={14} className="text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={4} className="px-4 py-3 font-semibold">TOTAL</td>
                  <td className="px-4 py-3 font-bold tabular-nums">{thb(totalMonthly)}</td>
                  <td colSpan={4} className="px-4 py-3 text-muted-foreground text-xs">{thb(totalYearly)}/year</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Income" : "Add Income"} className="max-w-2xl">
        <IncomeForm item={formData} onChange={setField} />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name || formData.amount <= 0}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
