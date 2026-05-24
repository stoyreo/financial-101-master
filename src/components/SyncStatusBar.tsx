"use client";

/**
 * SYNC STATUS BAR
 * ───────────────
 * Shows progress for BOTH halves of a save:
 *   - localSyncStatus  (localStorage persistence, instant)
 *   - remoteSyncStatus (POST /api/sync → data/user-*.json, server-backed)
 *
 * Reads directly from the Zustand store, so every store mutation that
 * triggers saveUserNamespaceAsync — or every admin-user action that updates
 * the sync status setters — moves this bar in real time.
 *
 * Draggable: grab the header bar to reposition. Double-click header to snap
 * back to the default bottom-right corner.
 */

import { useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";

type Phase = "idle" | "local" | "remote" | "done" | "error";

// Default position: bottom-right corner (negative values = offset from right/bottom edge)
const DEFAULT_POS = { bottom: 16, right: 16 };

export default function SyncStatusBar() {
  const localStatus = useStore((s) => s.localSyncStatus);
  const remoteStatus = useStore((s) => s.remoteSyncStatus);
  const lastLocal = useStore((s) => s.lastLocalSaveTime);
  const lastRemote = useStore((s) => s.lastRemoteSaveTime);
  const lastError = useStore((s) => s.lastSyncError);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("Idle");
  const [visible, setVisible] = useState(false);

  // ── Draggable state ────────────────────────────────────────────────────
  // Store as { top, left } once the user starts dragging (switches from
  // bottom/right anchoring to top/left so position is stable while dragging).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      setPos({
        top: ev.clientY - dragOffset.current.y,
        left: ev.clientX - dragOffset.current.x,
      });
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function snapToDefault() {
    setPos(null); // back to CSS bottom-right anchor
  }

  // ── Derive phase + progress from store statuses ────────────────────────
  useEffect(() => {
    if (localStatus === "error" || remoteStatus === "error") {
      setPhase("error");
      setPct(100);
      setMsg(lastError ?? "Sync error");
      setVisible(true);
      return;
    }
    if (localStatus === "saving") {
      setPhase("local");
      setPct(25);
      setMsg("Saving locally…");
      setVisible(true);
      return;
    }
    if (remoteStatus === "saving") {
      setPhase("remote");
      setPct(70);
      setMsg("Syncing to server…");
      setVisible(true);
      return;
    }
    if (localStatus === "completed" || remoteStatus === "completed") {
      setPhase("done");
      setPct(100);
      setMsg(remoteStatus === "completed" ? "Synced to server ✓" : "Saved locally ✓");
      setVisible(true);
      return;
    }
    if (localStatus === "idle" && remoteStatus === "idle") {
      const timer = setTimeout(() => setVisible(false), 800);
      setPhase("idle");
      return () => clearTimeout(timer);
    }
  }, [localStatus, remoteStatus, lastError]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  if (!visible) return null;

  const color =
    phase === "done" ? "bg-green-500" : phase === "error" ? "bg-red-500" : "bg-blue-500";
  const lastAt = phase === "done" ? lastRemote ?? lastLocal : null;

  const style: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left, bottom: "auto", right: "auto" }
    : { bottom: DEFAULT_POS.bottom, right: DEFAULT_POS.right };

  return (
    <div
      ref={panelRef}
      className="fixed w-72 rounded-xl shadow-lg bg-card text-card-foreground border border-border z-[60] opacity-90"
      style={style}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        onDoubleClick={snapToDefault}
        className="flex items-center justify-between px-3 pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
        title="Drag to reposition · double-click to snap back"
      >
        <span className="text-xs font-semibold text-foreground">Web → Database Sync</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground">{pct}%</span>
          <GripHorizontal size={12} className="text-muted-foreground" />
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="h-2 w-full bg-muted rounded overflow-hidden">
          <div
            className={`h-2 rounded transition-all duration-300 ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="text-xs mt-2 text-muted-foreground">{msg}</div>

        <div className="text-[11px] mt-1 flex justify-between text-muted-foreground">
          <span>
            Local:{" "}
            <strong
              className={
                localStatus === "completed"
                  ? "text-green-600 dark:text-green-400"
                  : localStatus === "error"
                    ? "text-red-600 dark:text-red-400"
                    : localStatus === "saving"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground"
              }
            >
              {localStatus}
            </strong>
          </span>
          <span>
            Remote:{" "}
            <strong
              className={
                remoteStatus === "completed"
                  ? "text-green-600 dark:text-green-400"
                  : remoteStatus === "error"
                    ? "text-red-600 dark:text-red-400"
                    : remoteStatus === "saving"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground"
              }
            >
              {remoteStatus}
            </strong>
          </span>
        </div>

        {phase === "done" && lastAt && (
          <div className="text-[11px] mt-1 text-green-600 dark:text-green-400">
            ✓ Data synced @ {new Date(lastAt).toLocaleTimeString()}
          </div>
        )}
        {phase === "error" && lastError && (
          <div className="text-[11px] mt-1 text-red-600 dark:text-red-400 break-all">
            {lastError}
          </div>
        )}
      </div>
    </div>
  );
}
