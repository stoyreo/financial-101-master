"use client";

/**
 * HumanoidDragAgent
 *
 * The little floating robot avatar from the OTIF AI panel, ported from raw
 * DOM/CSS/JS (OTIF_AI_Chat_Panel.html) into a native React component.
 *
 * Grab it, throw it anywhere on the page — it flies, impacts with particles
 * + a shockwave + an "insight halo", then flies home. Wherever it lands, it
 * resolves a *target* (via `data-ai-action`/`data-ai-label`/`data-ai-context`
 * attributes first, falling back to a generic visible-element scrape) and
 * reports it via `onThrow`, so the chat panel can open with that context
 * pre-loaded ("Acknowledging the Actual Spend card you dropped me on...").
 *
 * Differences from the OTIF source (deliberate simplifications — this lives
 * in one native document, not a Streamlit iframe sandwich):
 *   - No cross-iframe host resolution (resolveHost/HOST.offX/offY) — we're
 *     already in the top document, so viewport coords ARE host coords.
 *   - No Plotly-specific stacked-bar hit-test (_plotlyHit) — this app uses
 *     Recharts, not Plotly. The data-ai-action mechanism covers charts too;
 *     wrap a chart container in a div with those attributes to opt in.
 *   - Effects (particles/shockwave/halo) append directly to document.body.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ThrowTarget = {
  action: string;          // e.g. "stat-card", "table-row", "chart", "section"
  label: string;           // short human label, e.g. `"Actual Spend"`
  context?: string;        // longer scraped/declared context text for the model
};

type RobotMode = "home" | "held" | "flying" | "impact" | "return";

const IMPACT_COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f472b6"];
const SKIP_TAGS = new Set(["HTML", "BODY", "SCRIPT", "STYLE", "META", "HEAD", "svg", "path", "line", "circle", "rect", "polygon", "defs", "g"]);
const SKIP_CLASSES = ["ai-avatar-zone", "ai-robot-ghost", "ai-hover-ring", "ai-drag-ghost", "ai-chat-panel"];

function compact(text: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function nearestUsefulText(el: Element | null): string {
  const own = compact(el?.textContent || "");
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 5; depth++, cur = cur.parentElement) {
    try {
      const r = cur.getBoundingClientRect();
      const text = compact(cur.textContent || "");
      if (!text || text.length <= own.length) continue;
      if (r.width >= 120 && r.height >= 60 && text.length <= 420) return text;
    } catch { /* ignore */ }
  }
  return own;
}

/** Hit-test the document at (x,y) → a ThrowTarget, or null if nothing useful. */
function findTarget(x: number, y: number): { el: Element; target: ThrowTarget; rect: DOMRect } | null {
  let stack: Element[] = [];
  try { stack = document.elementsFromPoint(x, y); } catch { return null; }

  // Pass 1: structured AI targets — opt-in via data-ai-action/-label/-context.
  for (const raw of stack) {
    if (!raw || SKIP_TAGS.has(raw.tagName)) continue;
    const el = raw.closest?.("[data-ai-action]");
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue;
    const action = el.getAttribute("data-ai-action") || "section";
    const label = el.getAttribute("data-ai-label") || compact(el.textContent || "").slice(0, 80) || "AI target";
    const context = el.getAttribute("data-ai-context") || compact(el.textContent || "").slice(0, 360);
    return { el, rect: r, target: { action, label: label.slice(0, 70), context: context.slice(0, 360) } };
  }

  // Pass 2: generic visible-element scrape.
  for (const el of stack) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    if ((el as HTMLElement).style?.pointerEvents === "none") continue;
    const cls = (el.className || "").toString();
    if (SKIP_CLASSES.some(c => cls.includes(c))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 28) continue;
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || compact(el.textContent || "").slice(0, 80) || el.tagName;
    if (!label || label.length < 3) continue;
    return { el, rect: r, target: { action: "section", label: label.slice(0, 60), context: nearestUsefulText(el).slice(0, 420) } };
  }
  return null;
}

function spawnParticles(cx: number, cy: number, n = 36) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const spd = 3 + Math.random() * 9;
    const sz = 3 + Math.random() * 8;
    const col = IMPACT_COLORS[Math.floor(Math.random() * IMPACT_COLORS.length)];
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;left:${cx - sz / 2}px;top:${cy - sz / 2}px;width:${sz}px;height:${sz}px;pointer-events:none;z-index:10003;background:${col};border-radius:50%;box-shadow:0 0 ${sz * 1.5}px ${col}80;`;
    document.body.appendChild(el);
    let vx = Math.cos(a) * spd, vy = Math.sin(a) * spd, life = 1, x = cx - sz / 2, y = cy - sz / 2;
    const tick = () => {
      if (life <= 0) { el.remove(); return; }
      vx *= 0.96; vy += 0.35; x += vx; y += vy; life -= 0.022;
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.opacity = String(Math.max(0, life));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function triggerShockwave(cx: number, cy: number) {
  const flash = document.createElement("div");
  flash.style.cssText = `position:fixed;left:${cx - 70}px;top:${cy - 70}px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.65) 0%,transparent 70%);pointer-events:none;z-index:10001;animation:aiImpactFlash 0.28s ease-out forwards;`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 320);
  [
    { size: 120, color: "rgba(99,102,241,0.9)", delay: 0, w: 3 },
    { size: 80, color: "rgba(167,139,250,0.75)", delay: 80, w: 2 },
    { size: 50, color: "rgba(52,211,153,0.65)", delay: 160, w: 1.5 },
  ].forEach(r => {
    setTimeout(() => {
      const ring = document.createElement("div");
      ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${r.size}px;height:${r.size}px;border-radius:50%;border:${r.w}px solid ${r.color};pointer-events:none;z-index:10002;animation:aiShockRing 0.65s cubic-bezier(0.2,0,0.4,1) forwards;`;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 720);
    }, r.delay);
  });
}

function spawnInsightHalo(cx: number, cy: number, label = "AI insight") {
  try {
    const halo = document.createElement("div");
    halo.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);width:190px;height:190px;border-radius:50%;pointer-events:none;z-index:10004;background:conic-gradient(from 0deg, transparent, rgba(34,211,238,.9), rgba(124,92,252,.85), transparent);mask:radial-gradient(circle, transparent 58%, #000 60%, #000 68%, transparent 70%);-webkit-mask:radial-gradient(circle, transparent 58%, #000 60%, #000 68%, transparent 70%);animation:aiInsightSpark .95s cubic-bezier(.2,.8,.2,1) forwards;filter:drop-shadow(0 0 18px rgba(34,211,238,.6));`;
    const tag = document.createElement("div");
    tag.textContent = label.slice(0, 42);
    tag.style.cssText = `position:fixed;left:${cx}px;top:${cy + 72}px;transform:translateX(-50%);pointer-events:none;z-index:10005;padding:5px 10px;border-radius:999px;background:rgba(15,23,42,.9);border:1px solid rgba(34,211,238,.6);color:#e0f2fe;font:700 10px Inter,system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 0 24px rgba(34,211,238,.22);animation:aiImpactFlash .95s ease-out forwards;`;
    document.body.appendChild(halo);
    document.body.appendChild(tag);
    setTimeout(() => { halo.remove(); tag.remove(); }, 1000);
  } catch { /* ignore */ }
}

export interface HumanoidDragAgentProps {
  /** Called once the throw lands and a target is resolved (or with null on a "miss"). */
  onThrow: (target: ThrowTarget | null) => void;
  /** Short status line shown in the badge under the avatar. */
  status?: string;
  /** 0-100 — drives the little "processing" bar (purely cosmetic, e.g. tie to streaming state). */
  load?: number;
}

const KEYFRAMES = `
@keyframes aiRingRotate { to { transform: rotate(360deg); } }
@keyframes aiAuraBreathe { 0%,100% { opacity:.55; transform:scale(1);} 50% { opacity:.9; transform:scale(1.08);} }
@keyframes aiScanOrbit { to { transform: rotate(-360deg); } }
@keyframes aiBodyGlow { 0%,100% { box-shadow: 0 0 0 rgba(56,189,248,0);} 50% { box-shadow: 0 0 22px rgba(56,189,248,.35);} }
@keyframes aiGrabHint { 0%,100% { opacity:.35; transform: translate(-50%,0);} 50% { opacity:.9; transform: translate(-50%,-2px);} }
@keyframes aiFloat { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-10px);} }
@keyframes aiImpactFlash { from { opacity:1; transform: scale(.6);} to { opacity:0; transform: scale(1.5);} }
@keyframes aiShockRing { from { opacity:.9; transform: translate(-50%,-50%) scale(.3);} to { opacity:0; transform: translate(-50%,-50%) scale(1);} }
@keyframes aiInsightSpark { 0% { transform:translate(-50%,-50%) scale(.4) rotate(0deg); opacity:0;} 18% { opacity:1;} 100% { transform:translate(-50%,-50%) scale(1.5) rotate(180deg); opacity:0;} }
@keyframes aiRobotMouth { from { transform: scaleY(.4);} to { transform: scaleY(1);} }
`;

export function HumanoidDragAgent({ onThrow, status = "Ready to help", load = 14 }: HumanoidDragAgentProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  // Mutable flight state (avoid re-render thrash during 60fps drag/flight).
  const flight = useRef({
    mode: "home" as RobotMode,
    x: 0, y: 0, vx: 0, vy: 0, rot: 0,
    raf: 0,
    grabOffset: { x: 0, y: 0 },
    homeRect: null as DOMRect | null,
  });

  const setGhostStyle = useCallback((mode: RobotMode, x: number, y: number, rot: number, scale = 1) => {
    const g = ghostRef.current;
    const ring = ringRef.current;
    if (!g) return;
    if (mode === "home") { g.style.display = "none"; if (ring) ring.style.display = "none"; return; }
    g.style.display = "flex";
    g.style.left = `${x}px`;
    g.style.top = `${y}px`;
    g.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${scale})`;
    g.style.filter = mode === "impact"
      ? "drop-shadow(0 0 18px rgba(99,102,241,1)) drop-shadow(0 0 36px rgba(99,102,241,0.7))"
      : mode === "flying"
      ? "drop-shadow(0 0 14px rgba(96,165,250,0.9)) drop-shadow(0 0 28px rgba(96,165,250,0.5))"
      : "drop-shadow(0 0 8px rgba(96,165,250,0.6))";
  }, []);

  const showHoverRing = useCallback((rect: DOMRect | null) => {
    const ring = ringRef.current;
    if (!ring) return;
    if (!rect) { ring.style.display = "none"; return; }
    ring.style.display = "block";
    ring.style.left = `${rect.left - 4}px`;
    ring.style.top = `${rect.top - 4}px`;
    ring.style.width = `${rect.width + 8}px`;
    ring.style.height = `${rect.height + 8}px`;
  }, []);

  const stopFlight = useCallback(() => {
    if (flight.current.raf) cancelAnimationFrame(flight.current.raf);
    flight.current.raf = 0;
  }, []);

  const flyHome = useCallback(() => {
    const home = zoneRef.current?.getBoundingClientRect();
    if (!home) { setGhostStyle("home", 0, 0, 0); flight.current.mode = "home"; setGrabbed(false); return; }
    const target = { x: home.left + home.width / 2, y: home.top + home.height / 2 };
    flight.current.mode = "return";
    const f = flight.current;
    stopFlight();
    const step = () => {
      const dx = target.x - f.x, dy = target.y - f.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        flight.current.mode = "home";
        setGhostStyle("home", 0, 0, 0);
        showHoverRing(null);
        setGrabbed(false);
        return;
      }
      f.x += dx * 0.18;
      f.y += dy * 0.18;
      f.rot += 14;
      setGhostStyle("return", f.x, f.y, f.rot);
      f.raf = requestAnimationFrame(step);
    };
    f.raf = requestAnimationFrame(step);
  }, [setGhostStyle, showHoverRing, stopFlight]);

  const impactAt = useCallback((x: number, y: number, hit: ReturnType<typeof findTarget>) => {
    flight.current.mode = "impact";
    setGhostStyle("impact", x, y, flight.current.rot, 1.25);
    showHoverRing(hit?.rect ?? null);
    triggerShockwave(x, y);
    spawnParticles(x, y);
    if (hit) spawnInsightHalo(x, y, hit.target.label);
    onThrow(hit ? hit.target : null);
    setTimeout(() => { showHoverRing(null); flyHome(); }, 360);
  }, [flyHome, onThrow, setGhostStyle, showHoverRing]);

  const startThrow = useCallback((startX: number, startY: number, vx: number, vy: number) => {
    const f = flight.current;
    f.mode = "flying";
    f.x = startX; f.y = startY; f.vx = vx; f.vy = vy; f.rot = 0;
    stopFlight();
    const step = () => {
      f.x += f.vx; f.y += f.vy;
      f.vx *= 0.985; f.vy = f.vy * 0.985 + 0.55; // gravity + drag
      f.rot += 16;
      setGhostStyle("flying", f.x, f.y, f.rot);

      const hit = findTarget(f.x, f.y);
      showHoverRing(hit?.rect ?? null);

      const offscreen = f.x < -80 || f.x > window.innerWidth + 80 || f.y > window.innerHeight + 80;
      const settled = Math.abs(f.vy) < 0.6 && f.y > window.innerHeight * 0.35;

      if (offscreen) {
        flyHome();
        return;
      }
      if (settled || f.y > window.innerHeight - 40) {
        impactAt(f.x, f.y, hit);
        return;
      }
      f.raf = requestAnimationFrame(step);
    };
    f.raf = requestAnimationFrame(step);
  }, [flyHome, impactAt, setGhostStyle, showHoverRing, stopFlight]);

  // ── Drag handling (pointer events cover mouse + touch) ──────────────────
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;

    let dragging = false;
    let last = { x: 0, y: 0, t: 0 };
    let vel = { x: 0, y: 0 };
    let pointerId: number | null = null;

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const f = flight.current;
      const now = performance.now();
      const dt = Math.max(1, now - last.t);
      vel = { x: ((e.clientX - last.x) / dt) * 16, y: ((e.clientY - last.y) / dt) * 16 };
      last = { x: e.clientX, y: e.clientY, t: now };
      f.x = e.clientX - f.grabOffset.x;
      f.y = e.clientY - f.grabOffset.y;
      f.mode = "held";
      setGhostStyle("held", f.x, f.y, 0, 1.05);
      const hit = findTarget(f.x, f.y);
      showHoverRing(hit?.rect ?? null);
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (pointerId != null) { try { zone.releasePointerCapture(pointerId); } catch { /* ignore */ } }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const f = flight.current;
      const speed = Math.hypot(vel.x, vel.y);
      if (speed < 1.5) {
        // Soft drop = a "throw straight down" onto whatever's underneath.
        startThrow(f.x, f.y, 0, 4);
      } else {
        startThrow(f.x, f.y, vel.x, vel.y);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      flight.current = {
        ...flight.current,
        mode: "held",
        x: cx, y: cy,
        grabOffset: { x: e.clientX - cx, y: e.clientY - cy },
        homeRect: rect,
      };
      dragging = true;
      pointerId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      vel = { x: 0, y: 0 };
      setGrabbed(true);
      setGhostStyle("held", cx, cy, 0, 1.05);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      e.preventDefault();
    };

    zone.addEventListener("pointerdown", onDown);
    return () => {
      zone.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      stopFlight();
    };
  }, [setGhostStyle, showHoverRing, startThrow, stopFlight]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Avatar dock */}
      <div
        ref={zoneRef}
        className="ai-avatar-zone relative flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-4 select-none touch-none"
        style={{
          background: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)",
          border: "1px solid rgba(96,165,250,0.18)",
          cursor: grabbed ? "grabbing" : "grab",
          minHeight: 150,
        }}
        title="Drag me onto a card or chart and let go to ask about it"
      >
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap pointer-events-none"
          style={{ color: "rgba(96,165,250,0.7)", animation: "aiGrabHint 2.5s ease-in-out infinite" }}
        >
          drag · drop · ask
        </div>

        <div
          className="relative flex items-center justify-center rounded-full"
          style={{ width: 80, height: 80, border: "2px solid rgba(34,197,94,0.5)", animation: "aiRingRotate 4s linear infinite" }}
        >
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ inset: -10, background: "radial-gradient(circle, rgba(34,211,238,.28), rgba(124,92,252,.11) 45%, transparent 72%)", animation: "aiAuraBreathe 2.8s ease-in-out infinite", zIndex: -2 }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ inset: -5, border: "1px dashed rgba(125,211,252,.45)", animation: "aiScanOrbit 7s linear infinite", zIndex: -1 }}
          />
          <div
            className="flex items-center justify-center rounded-full text-2xl"
            style={{ width: 52, height: 52, background: "linear-gradient(135deg, #1e40af, #3730a3)", animation: "aiBodyGlow 3.4s ease-in-out infinite" }}
          >
            🤖
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1 backdrop-blur max-w-full"
          style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(34,197,94,0.4)" }}
        >
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.8)" }} />
          <span className="text-[11px] font-medium truncate" style={{ color: "#cbd5e1" }}>{status}</span>
        </div>

        <div className="w-[calc(100%-12px)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] uppercase font-semibold" style={{ color: "#475569" }}>processing</span>
            <span className="text-[9px] font-semibold tabular-nums" style={{ color: "#22c55e" }}>{Math.round(load)}%</span>
          </div>
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "#ffffff0f" }}>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(4, load))}%`, background: "#22c55e" }} />
          </div>
        </div>
      </div>

      {/* Flying ghost + hover ring — fixed-position overlays appended to body via portal-less fixed positioning */}
      <div
        ref={ghostRef}
        className="ai-robot-ghost"
        style={{
          position: "fixed", left: 0, top: 0, display: "none", pointerEvents: "none", zIndex: 10000,
          width: 56, height: 56, alignItems: "center", justifyContent: "center",
          borderRadius: "50%", background: "linear-gradient(135deg, #1e40af, #3730a3)",
          fontSize: 26, willChange: "transform, left, top",
        }}
      >
        🤖
      </div>
      <div
        ref={ringRef}
        className="ai-hover-ring"
        style={{
          position: "fixed", display: "none", pointerEvents: "none", zIndex: 9998, borderRadius: 14,
          border: "2px solid rgba(167,139,250,0.9)",
          boxShadow: "0 0 24px rgba(167,139,250,0.4), inset 0 0 20px rgba(167,139,250,0.08)",
          background: "rgba(99,102,241,0.06)", transition: "all 0.08s",
        }}
      />
    </>
  );
}
