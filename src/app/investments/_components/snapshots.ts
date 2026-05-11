/**
 * Investment scenario snapshots — sessionStorage, keyed by userId.
 * Per CLAUDE.md: NEVER localStorage.
 */

export type ScenarioOverride = {
  accountId: string;
  accountName: string;
  accountType: string;
  returnPctOverride?: number;       // e.g. 0.05 for 5%
  monthlyContribOverride?: number;  // THB
};

export type InvestmentScenario = {
  id: string;
  name: string;
  horizonYears: number;
  inflationPct: number;
  applyTaxDrag: boolean;
  taxDragPct: number;
  monteCarloEnabled: boolean;
  monteCarloVolPct: number;
  overrides: ScenarioOverride[];
  createdAt: string;
};

function storageKey(userId: string): string {
  return `f101:investments:scenarios:${userId}`;
}

export function loadScenarios(userId: string): InvestmentScenario[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

export function saveScenarios(userId: string, scenarios: InvestmentScenario[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(scenarios.slice(0, 10)));
  } catch {
    // sessionStorage might be full — silently ignore
  }
}

export function addScenario(userId: string, scenario: InvestmentScenario): InvestmentScenario[] {
  const existing = loadScenarios(userId).filter(s => s.id !== scenario.id);
  const updated = [scenario, ...existing].slice(0, 10);
  saveScenarios(userId, updated);
  return updated;
}

export function removeScenario(userId: string, id: string): InvestmentScenario[] {
  const updated = loadScenarios(userId).filter(s => s.id !== id);
  saveScenarios(userId, updated);
  return updated;
}
