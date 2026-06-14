"use client";

/**
 * GlobalAiAvatar
 *
 * The ONE AI Avatar for the whole app — mounted once in layout.tsx so
 * "Fin" (drag-and-throw assistant + live Claude chat) is available on every
 * page, not just /expenses/actuals. Replaces the earlier per-page
 * <AiAvatarPanel> mount (which would have meant duplicate avatars).
 *
 * How pages feed it context:
 *   - A page can call useRegisterAiSnapshot(snapshot, label, quickActions)
 *     (see src/lib/ai-snapshot-context.tsx) to hand Fin a rich, page-shaped
 *     snapshot — e.g. /expenses/actuals registers its budget-vs-actual data.
 *   - Pages that haven't registered anything fall back to a generic
 *     whole-of-plan snapshot built here from the Zustand store (income,
 *     expenses, debts, investments, net worth — see buildGeneralChatSnapshot).
 *
 * Gating: 🔐 only renders for signed-in users (getCurrentAccount() !== null).
 * Session state lives in sessionStorage, not the store, so we poll lightly —
 * matching the "no hardcoded fallback account" rule from accounts.ts.
 *
 * UI: a small floating launcher orb (bottom-right, every page) that expands
 * into a floating card with the avatar dock + chat panel. Collapsing never
 * unmounts the chat — conversation state survives across navigation AND
 * collapse/expand, exactly like the OTIF reference's persistent panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { HumanoidDragAgent, type ThrowTarget } from "./HumanoidDragAgent";
import { AiChatPanel } from "./AiChatPanel";
import { getCurrentAccount } from "@/lib/accounts";
import {
  useStore,
  selectActiveScenario,
  selectMortgage,
  selectTotalMonthlyIncome,
  selectTotalMonthlyExpenses,
  selectTotalMonthlyDebtPayments,
  selectTotalDebtBalance,
  selectTotalInvestmentValue,
  selectNetWorth,
} from "@/lib/store";
import { useAiSnapshotContext } from "@/lib/ai-snapshot-context";
import { buildGeneralChatSnapshot, describeSnapshot, type GeneralChatSnapshot } from "@/lib/ai-chat-context";

const SESSION_POLL_MS = 2000;

/** Lightweight, polling-based session check — sessionStorage isn't reactive. */
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(() => getCurrentAccount() !== null);

  useEffect(() => {
    const check = () => setSignedIn(getCurrentAccount() !== null);
    check();
    const id = setInterval(check, SESSION_POLL_MS);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  return signedIn;
}

/** Whole-of-plan snapshot for pages that haven't registered a richer one. */
function useGeneralSnapshot(active: boolean): GeneralChatSnapshot | null {
  const scenario = useStore(selectActiveScenario);
  const mortgage = useStore(selectMortgage);
  const monthlyIncome = useStore(selectTotalMonthlyIncome);
  const monthlyExpenses = useStore(selectTotalMonthlyExpenses);
  const monthlyDebtPayments = useStore(selectTotalMonthlyDebtPayments);
  const totalDebtBalance = useStore(selectTotalDebtBalance);
  const totalInvestmentValue = useStore(selectTotalInvestmentValue);
  const netWorth = useStore(selectNetWorth);

  return useMemo(() => {
    if (!active) return null;
    return buildGeneralChatSnapshot({
      scenarioName: scenario?.name ?? null,
      monthlyIncome,
      monthlyExpenses,
      monthlyDebtPayments,
      totalDebtBalance,
      totalInvestmentValue,
      netWorth,
      mortgage: mortgage
        ? {
            currentBalance: mortgage.currentBalance,
            standardMonthlyPayment: mortgage.standardMonthlyPayment,
            extraMonthlyPayment: mortgage.extraMonthlyPayment,
          }
        : null,
    });
  }, [active, scenario?.name, monthlyIncome, monthlyExpenses, monthlyDebtPayments, totalDebtBalance, totalInvestmentValue, netWorth, mortgage]);
}

export default function GlobalAiAvatar() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ThrowTarget | null>(null);
  const [status, setStatus] = useState("Ready to help");
  const [load, setLoad] = useState(12);

  // Page-specific registration (e.g. /expenses/actuals's rich budget snapshot)
  // wins; otherwise fall back to the generic whole-of-plan snapshot below.
  const { registration } = useAiSnapshotContext();
  const generalSnapshot = useGeneralSnapshot(signedIn && !registration);

  const snapshot = registration ? registration.snapshot : generalSnapshot;
  const snapshotLabel = registration
    ? (registration.label ?? null)
    : describeSnapshot(generalSnapshot);
  const quickActions = registration?.quickActions;

  const handleThrow = useCallback((target: ThrowTarget | null) => {
    if (target) {
      setStatus(`Looking at "${target.label}"…`);
      setLoad(72);
      setPendingTarget(target);
      setOpen(true);
    } else {
      setStatus("Hmm, nothing there — try a card or chart");
      setLoad(20);
    }
    setTimeout(() => { setStatus("Ready to help"); setLoad(12); }, 4000);
  }, []);

  const consumeTarget = useCallback(() => setPendingTarget(null), []);

  if (!signedIn) return null;

  return (
    <>
      {/* Avatar dock — only visible when chat is open */}
      {open && (
        <div
          className="hidden md:block"
          style={{ position: "fixed", right: 20, bottom: "auto", top: "calc(50% - 612px)", zIndex: 70 }}
        >
          <HumanoidDragAgent onThrow={handleThrow} status={status} load={load} />
        </div>
      )}

      {/* Launcher orb */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full pl-3 pr-4 py-2.5 shadow-lg transition-transform hover:scale-105"
          style={{
            position: "fixed",
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 71,
            background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
            color: "#eff6ff",
            border: "1px solid rgba(96,165,250,0.4)",
          }}
          title="Open Fin — your AI assistant"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold">Ask Fin</span>
        </button>
      )}

      {/* Floating chat card */}
      {open && (
        <div
          className="flex flex-col gap-2 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            position: "fixed",
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 71,
            width: 360,
            maxWidth: "calc(100vw - 40px)",
            height: 560,
            maxHeight: "calc(100vh - 100px)",
            background: "rgba(15,23,42,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(96,165,250,0.18)",
            padding: 10,
          }}
        >
          <div className="flex items-center justify-between shrink-0 px-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" style={{ color: "#60a5fa" }} />
              <span className="text-[11px] font-semibold" style={{ color: "#cbd5e1" }}>Fin — your AI assistant</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 transition-colors hover:bg-white/10"
              title="Minimize"
            >
              <X className="h-3.5 w-3.5" style={{ color: "#94a3b8" }} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AiChatPanel
              snapshot={snapshot}
              snapshotLabel={snapshotLabel}
              pendingTarget={pendingTarget}
              onConsumeTarget={consumeTarget}
              quickActions={quickActions}
            />
          </div>
        </div>
      )}
    </>
  );
}
