/**
 * DCA / RMF ROI simulator — saved assumption entries.
 * sessionStorage, keyed by userId. Per CLAUDE.md: NEVER localStorage.
 */

export type DCAScenario = {
  id: string;
  name: string;
  fundChoice: string;        // "PVDMPFEQ" | "SCBGOLDHRMF" | "custom" | `ai:<code>`
  fundLabel: string;         // display label captured at save time (AI funds aren't stable across sessions)
  monthlyAmount: number;
  years: number;
  customRatePct: number;     // only meaningful when fundChoice === "custom"
  taxBracket: number;
  results: {
    totalInvested: number;
    futureValue: number;
    roiPct: number;
    totalTaxRelief: number;
    combinedRoiPct: number;
  };
  createdAt: string;
};

function storageKey(userId: string): string {
  return `f101:investments:dca-scenarios:${userId}`;
}

export function loadDCAScenarios(userId: string): DCAScenario[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

export function saveDCAScenarios(userId: string, scenarios: DCAScenario[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(scenarios.slice(0, 10)));
  } catch {
    // sessionStorage might be full — silently ignore
  }
}

export function addDCAScenario(userId: string, scenario: DCAScenario): DCAScenario[] {
  const existing = loadDCAScenarios(userId).filter(s => s.id !== scenario.id);
  const updated = [scenario, ...existing].slice(0, 10);
  saveDCAScenarios(userId, updated);
  return updated;
}

export function removeDCAScenario(userId: string, id: string): DCAScenario[] {
  const updated = loadDCAScenarios(userId).filter(s => s.id !== id);
  saveDCAScenarios(userId, updated);
  return updated;
}
