"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Android install + update handling (v3.10.0).
 * - Registers /sw.js (production only)
 * - Shows "Install app" when Chrome / Samsung Internet says the app is installable
 * - Shows "Update now" when a new deploy is waiting
 */
export default function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("f101_install_dismissed") === "1") setDismissed(true);
    } catch {}

    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BIPEvent); };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

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
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (waiting) {
    return (
      <div role="status" className="pwa-bar">
        <span>A new version of Financial 101 is ready.</span>
        <button className="pwa-btn" onClick={() => waiting.postMessage("SKIP_WAITING")}>Update now</button>
      </div>
    );
  }

  if (installEvt && !dismissed) {
    return (
      <div role="dialog" aria-label="Install app" className="pwa-bar">
        <span>Install Financial 101 on this phone for full-screen use.</span>
        <span className="pwa-actions">
          <button
            className="pwa-btn pwa-btn-ghost"
            onClick={() => {
              setDismissed(true);
              try { sessionStorage.setItem("f101_install_dismissed", "1"); } catch {}
            }}
          >
            Not now
          </button>
          <button
            className="pwa-btn"
            onClick={async () => { await installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}
          >
            Install app
          </button>
        </span>
      </div>
    );
  }

  return null;
}
