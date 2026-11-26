"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type ManualKind = "safari-mac" | "ios";

const DISMISS_KEY = "f101_install_dismissed_at";
const DISMISS_DAYS = 30;
const MANUAL_DELAY_MS = 4000;

function isStandalone(): boolean {
  try {
    const modes = ["standalone", "window-controls-overlay", "minimal-ui", "fullscreen"];
    if (modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

/** Browsers that never fire beforeinstallprompt but can still install via the Share menu. */
function manualKind(): ManualKind | null {
  const ua = navigator.userAgent;
  const touchMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua); // iPadOS reports as Mac
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua);
  if (/Macintosh/.test(ua) && safari) {
    const v = /Version\/(\d+)/.exec(ua);
    if (v && Number(v[1]) >= 17) return "safari-mac"; // "Add to Dock" arrived in Safari 17
  }
  return null;
}

/**
 * Install + update handling.
 * - Registers /sw.js (production only)
 * - Chrome / Edge (desktop + Android): captures beforeinstallprompt and offers "Install app"
 * - Safari 17+ on macOS and iOS: shows manual "Add to Dock / Home Screen" instructions
 * - Hidden when already running as an installed app; dismissal is remembered for 30 days
 * - Shows "Update now" when a new deploy is waiting
 */
export default function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [manual, setManual] = useState<ManualKind | null>(null);
  const [hidden, setHidden] = useState(true); // true until client checks pass (no SSR flash)

  useEffect(() => {
    const suppressed = isStandalone() || recentlyDismissed();
    setHidden(suppressed);

    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BIPEvent); };
    const onInstalled = () => { setInstallEvt(null); setManual(null); rememberDismissal(); setHidden(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // If the display mode flips while the tab is open (just installed), hide too.
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => { if (isStandalone()) setHidden(true); };
    mq.addEventListener?.("change", onMode);

    let manualTimer: ReturnType<typeof setTimeout> | undefined;
    if (!suppressed) {
      const kind = manualKind();
      // Delay so nobody is nagged instantly on first paint.
      if (kind) manualTimer = setTimeout(() => setManual(kind), MANUAL_DELAY_MS);
    }

    let onVisible: (() => void) | undefined;
    let reloaded = false;
    const onControllerChange = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state !== "installed") return;
            if (navigator.serviceWorker.controller) setWaiting(nw);
            else nw.postMessage("SKIP_WAITING");
          });
        });
        onVisible = () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); };
        document.addEventListener("visibilitychange", onVisible);
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener?.("change", onMode);
      if (manualTimer) clearTimeout(manualTimer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const dismiss = () => { rememberDismissal(); setHidden(true); };

  if (waiting) {
    return (
      <div role="status" className="pwa-bar">
        <span>A new version of Financial 101 is ready.</span>
        <button className="pwa-btn" onClick={() => waiting.postMessage("SKIP_WAITING")}>Update now</button>
      </div>
    );
  }

  if (hidden) return null;

  if (installEvt) {
    return (
      <div role="dialog" aria-label="Install app" className="pwa-bar">
        <span>Install Financial 101 for full-screen, app-like use.</span>
        <span className="pwa-actions">
          <button className="pwa-btn pwa-btn-ghost" onClick={dismiss}>Not now</button>
          <button
            className="pwa-btn"
            onClick={async () => {
              try {
                await installEvt.prompt();
                const choice = await installEvt.userChoice;
                if (choice.outcome === "dismissed") rememberDismissal();
              } catch {}
              setInstallEvt(null);
            }}
          >
            Install app
          </button>
        </span>
      </div>
    );
  }

  if (manual) {
    return (
      <div role="dialog" aria-label="Install app" className="pwa-bar">
        <span>
          {manual === "safari-mac"
            ? "Install Financial 101: in Safari choose File > Add to Dock."
            : "Install Financial 101: tap the Share button, then Add to Home Screen."}
        </span>
        <span className="pwa-actions">
          <button className="pwa-btn pwa-btn-ghost" onClick={dismiss}>Got it</button>
        </span>
      </div>
    );
  }

  return null;
}
