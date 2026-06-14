"use client";

import { useState, useEffect, useCallback } from "react";
import { getSession } from "@/lib/auth-client";
import {
  getAuditLog, clearAuditLog, EVENT_LABELS, EVENT_COLORS,
  type AuditEvent, type AuditEventType,
} from "@/lib/audit-log";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Badge, PageHeader, Select,
} from "@/components/ui";
import { ClipboardList, Trash2, RefreshCw, Filter, ShieldCheck } from "lucide-react";

const ALL_TYPES = "all";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "Asia/Bangkok",
    });
  } catch { return iso; }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AuditLogPage() {
  const session = getSession();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<string>(ALL_TYPES);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const reload = useCallback(() => {
    if (session?.userId) setEvents(getAuditLog(session.userId));
  }, [session?.userId]);

  useEffect(() => { reload(); }, [reload]);

  const handleClear = () => {
    if (session?.userId) { clearAuditLog(session.userId); setEvents([]); }
    setShowConfirmClear(false);
  };

  const filtered = filter === ALL_TYPES
    ? events
    : events.filter(e => e.type === filter);

  // Count by type for summary
  const counts: Partial<Record<AuditEventType, number>> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const typeOptions = Object.entries(EVENT_LABELS).filter(([type]) => counts[type as AuditEventType]);

  if (!session) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <ShieldCheck size={32} className="mx-auto mb-2 opacity-40" />
        Please log in to view the audit log.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Activity history for your account — logins, imports, exports, and data changes."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {events.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setShowConfirmClear(true)}
              >
                <Trash2 size={14} /> Clear Log
              </Button>
            )}
          </div>
        }
      />

      {/* Summary chips */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typeOptions.map(([type, label]) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? ALL_TYPES : type)}
              className={[
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                filter === type
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border hover:bg-muted",
              ].join(" ")}
            >
              {label} <span className="font-bold">{counts[type as AuditEventType]}</span>
            </button>
          ))}
          {filter !== ALL_TYPES && (
            <button
              onClick={() => setFilter(ALL_TYPES)}
              className="text-xs px-2.5 py-1 rounded-full border border-dashed border-border hover:bg-muted text-muted-foreground"
            >
              Show all
            </button>
          )}
        </div>
      )}

      {/* Clear confirm */}
      {showConfirmClear && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm">
          <span className="flex-1 text-destructive font-medium">
            This will permanently delete all {events.length} log entries. Continue?
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowConfirmClear(false)}>Cancel</Button>
          <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={handleClear}>
            Delete All
          </Button>
        </div>
      )}

      {/* Event list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList size={15} className="text-primary" />
            {filtered.length === 0 ? "No events" : `${filtered.length} event${filtered.length !== 1 ? "s" : ""}`}
            {filter !== ALL_TYPES && (
              <span className="text-muted-foreground font-normal">· filtered by {EVENT_LABELS[filter as AuditEventType]}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {events.length === 0
                  ? "No activity recorded yet. Events appear here as you use the app."
                  : "No events match this filter."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((event, i) => (
                <div key={event.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center mt-1">
                    <div className={[
                      "w-2 h-2 rounded-full shrink-0",
                      event.type === "login" ? "bg-emerald-500" :
                      event.type === "logout" ? "bg-slate-400" :
                      event.type === "data_reset" ? "bg-red-500" :
                      "bg-primary",
                    ].join(" ")} />
                    {i < filtered.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={[
                        "text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0",
                        EVENT_COLORS[event.type],
                      ].join(" ")}>
                        {EVENT_LABELS[event.type]}
                      </span>
                      <span className="text-sm">{event.detail}</span>
                    </div>
                    {event.meta && Object.keys(event.meta).length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(event.meta).map(([k, v]) => (
                          <span key={k} className="text-[11px] text-muted-foreground">
                            <span className="font-medium">{k}:</span> {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">{relativeTime(event.timestamp)}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 hidden sm:block">
                      {formatTime(event.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Audit log is stored locally in your browser · Max 500 events per user · Cleared on browser data wipe
      </p>
    </div>
  );
}
