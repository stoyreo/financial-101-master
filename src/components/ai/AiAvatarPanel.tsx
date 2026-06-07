"use client";

/**
 * AiAvatarPanel
 *
 * Composes HumanoidDragAgent (avatar + drag/throw physics) with AiChatPanel
 * (real Claude streaming chat) into the right-rail panel requested for
 * /expenses/actuals — the native-React replacement for OTIF's iframe-embedded
 * #avatar-zone + #messages combo.
 *
 * Flow: drag the avatar → throw it onto a card/chart/row marked with
 * data-ai-action/-label/-context → it impacts with particles + a shockwave →
 * the chat opens with a turn seeded from whatever it landed on.
 */

import { useCallback, useState } from "react";
import { HumanoidDragAgent, type ThrowTarget } from "./HumanoidDragAgent";
import { AiChatPanel } from "./AiChatPanel";

export interface AiAvatarPanelProps {
  snapshot?: unknown;
  snapshotLabel?: string | null;
  quickActions?: Array<{ label: string; sub?: string; prompt: string }>;
  className?: string;
}

export function AiAvatarPanel({ snapshot, snapshotLabel, quickActions, className }: AiAvatarPanelProps) {
  const [pendingTarget, setPendingTarget] = useState<ThrowTarget | null>(null);
  const [status, setStatus] = useState("Ready to help");
  const [load, setLoad] = useState(12);

  const handleThrow = useCallback((target: ThrowTarget | null) => {
    if (target) {
      setStatus(`Looking at "${target.label}"…`);
      setLoad(72);
      setPendingTarget(target);
    } else {
      setStatus("Hmm, nothing there — try a card or chart");
      setLoad(20);
    }
    setTimeout(() => { setStatus("Ready to help"); setLoad(12); }, 4000);
  }, []);

  const consumeTarget = useCallback(() => setPendingTarget(null), []);

  return (
    <aside className={`flex flex-col gap-3 ${className ?? ""}`} style={{ minHeight: 0 }}>
      <HumanoidDragAgent onThrow={handleThrow} status={status} load={load} />
      <div className="flex-1 min-h-0" style={{ height: 520 }}>
        <AiChatPanel
          snapshot={snapshot}
          snapshotLabel={snapshotLabel}
          pendingTarget={pendingTarget}
          onConsumeTarget={consumeTarget}
          quickActions={quickActions}
        />
      </div>
    </aside>
  );
}
