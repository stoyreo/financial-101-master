"use client";
import { useState, useEffect } from "react";
import { APP_VERSION, BUILD_DATE, CHANGELOG, getVersionDisplay } from "@/lib/version";
import { listSnapshots, saveSnapshot, deleteSnapshot, type Snapshot } from "@/lib/snapshots";
import { useStore } from "@/lib/store";
import { Modal, Button, Badge, Alert } from "@/components/ui";
import { History, Save, Trash2, RotateCcw, CheckCircle, Tag } from "lucide-react";

export function VersionPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"changelog" | "snapshots">("changelog");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");
  const { exportData, importData } = useStore();

  useEffect(() => {
    if (open) setSnapshots(listSnapshots());
  }, [open]);

  const handleSave = () => {
    const l = label.trim() || `Snapshot ${new Date().toLocaleDateString("th-TH")}`;
    saveSnapshot(l, APP_VERSION, exportData());
    setSnapshots(listSnapshots());
    setLabel("");
    setMsg("Snapshot saved!");
    setTimeout(() => setMsg(""), 3000);
  };

  const handleRestore = (snap: Snapshot) => {
    if (!confirm(`Restore "${snap.label}"? Current unsaved state will be overwritten.`)) return;
    importData(snap.data);
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    deleteSnapshot(id);
    setSnapshots(listSnapshots());
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground"
        title="Version & Snapshots"
      >
        <Tag size={12} />
        {getVersionDisplay()}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Financial 101 Master crafted by Toy — ${getVersionDisplay()}`} className="max-w-xl">
        {/* Tab switcher */}
        <div className="flex gap-1 mb-4 bg-muted p-1 rounded-lg">
          {(["changelog", "snapshots"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize
                ${tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "changelog" ? "Changelog" : "Saved Versions"}
            </button>
          ))}
        </div>

        {tab === "changelog" && (
          <div className="space-y-4">
            {CHANGELOG.map(entry => (
              <div key={entry.version}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">v{entry.version}</Badge>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
                <ul className="space-y-1">
                  {entry.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle size={11} className="text-emerald-500 mt-0.5 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === "snapshots" && (
          <div className="space-y-4">
            {/* Save current state */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs font-medium mb-2">Save current state as a snapshot</p>
              <div className="flex gap-2">
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={`e.g. "Before refinance" or "After salary raise"`}
                  className="flex-1 h-8 px-3 text-xs rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button size="sm" onClick={handleSave}><Save size={12} /> Save</Button>
              </div>
              {msg && <p className="text-xs text-emerald-600 mt-1">{msg}</p>}
            </div>

            {/* Snapshot list */}
            {snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No snapshots yet. Save one above.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {snapshots.map(snap => (
                  <div key={snap.id} className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{snap.label}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{snap.version}</Badge>
                        {fmt(snap.savedAt)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleRestore(snap)} title="Restore this snapshot">
                      <RotateCcw size={12} /> Restore
                    </Button>
                    <button onClick={() => handleDelete(snap.id)} className="p-1.5 hover:bg-destructive/10 rounded-md">
                      <Trash2 size={12} className="text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Snapshots are stored in your browser. Up to 20 kept.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
