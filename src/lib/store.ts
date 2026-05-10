/**
 * ZUSTAND STORE
 * ─────────────
 * Central state with localStorage persistence.
 * All financial data lives here; computed forecasts are derived on demand.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import type {
  Profile, IncomeItem, ExpenseItem, DebtAccount,
  InvestmentAccount, RetirementAssumptions, TaxAssumptions, Scenario,
  YearlyForecastRow, MonthlyForecastRow,
  Transaction, MerchantRule, StatementImport,
} from "./types";
import {
  seedProfile, seedIncomes, seedExpenses, seedDebts,
  seedInvestments, seedRetirement, seedTax, seedScenarios,
} from "./seed";
import { buildDefaultMerchantRules, newMerchantRule } from "./categorize";
import { loadUserData, persistUserData, saveRemoteUserData, loadRemoteUserData } from "./users";
import { getCurrentAccount } from "./accounts";
import { getSession } from "./auth";
import { generateYearlyForecast, generateMonthlyForecast } from "./engine/forecast";

interface Store {
  // ── Data ──────────────────────────────────────────────
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
  retirement: RetirementAssumptions;
  tax: TaxAssumptions;
  scenarios: Scenario[];
  activeScenarioId: string;
  isSeedLoaded: boolean;

  // ── User-defined expense categories (additive over BUDGET_CATEGORIES) ──
  customExpenseCategories: string[];

  // ── Actuals (imported credit-card statements) ─────────
  // Kept FOREVER for month-vs-month evolution & trend analysis.
  transactions: Transaction[];
  merchantRules: MerchantRule[];
  statementImports: StatementImport[];

  // ── Computed / cached ─────────────────────────────────
  yearlyForecast: YearlyForecastRow[];
  monthlyForecast: MonthlyForecastRow[];

  // ── Profile actions ───────────────────────────────────
  setProfile: (p: Partial<Profile>) => void;

  // ── Income actions ────────────────────────────────────
  addIncome: (item: Omit<IncomeItem, "id">) => void;
  updateIncome: (id: string, item: Partial<IncomeItem>) => void;
  deleteIncome: (id: string) => void;

  // ── Expense actions ───────────────────────────────────
  addExpense: (item: Omit<ExpenseItem, "id">) => void;
  updateExpense: (id: string, item: Partial<ExpenseItem>) => void;
  deleteExpense: (id: string) => void;

  // ── Custom expense category actions ──────────────────
  addExpenseCategory: (name: string) => boolean;        // false if duplicate / blank
  removeExpenseCategory: (name: string) => void;        // only removes if not used by any expense

  // ── Debt actions ──────────────────────────────────────
  addDebt: (item: Omit<DebtAccount, "id">) => void;
  updateDebt: (id: string, item: Partial<DebtAccount>) => void;
  deleteDebt: (id: string) => void;

  // ── Investment actions ────────────────────────────────
  addInvestment: (item: Omit<InvestmentAccount, "id">) => void;
  updateInvestment: (id: string, item: Partial<InvestmentAccount>) => void;
  deleteInvestment: (id: string) => void;

  // ── Retirement / Tax ──────────────────────────────────
  setRetirement: (r: Partial<RetirementAssumptions>) => void;
  setTax: (t: Partial<TaxAssumptions>) => void;

  // ── Scenario actions ──────────────────────────────────
  addScenario: (s: Omit<Scenario, "id" | "createdAt">) => void;
  updateScenario: (id: string, s: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;

  // ── Actuals actions ───────────────────────────────────
  importStatement: (
    statement: Omit<StatementImport, "id" | "importedAt" | "transactionCount" | "duplicatesSkipped">,
    txns: Transaction[]
  ) => { added: number; duplicates: number; statementImportId: string };
  recategorizeTransaction: (txnId: string, newCategory: string, learnRule?: boolean) => void;
  deleteTransaction: (txnId: string) => void;
  clearMonthTransactions: (billingMonth: string, accountId?: string) => void;
  deleteStatementImport: (statementId: string) => void;
  addMerchantRule: (pattern: string, category: string, isEssential?: boolean) => void;
  removeMerchantRule: (ruleId: string) => void;
  reapplyRules: () => void;

  // ── Forecast ──────────────────────────────────────────
  recomputeForecast: () => void;

  // ── Sync Status ───────────────────────────────────────
  localSyncStatus: "idle" | "saving" | "completed" | "error";
  remoteSyncStatus: "idle" | "saving" | "completed" | "error";
  lastLocalSaveTime: string | null;
  lastRemoteSaveTime: string | null;
  lastSyncError: string | null;
  setLocalSyncStatus: (status: "idle" | "saving" | "completed" | "error", error?: string) => void;
  setRemoteSyncStatus: (status: "idle" | "saving" | "completed" | "error", error?: string) => void;

  // ── Utility ───────────────────────────────────────────
  loadSeedData: () => void;
  loadUserNamespace: () => void;
  saveUserNamespace: () => void;
  saveUserNamespaceAsync: () => Promise<void>;
  exportData: () => string;
  importData: (json: string) => boolean;
  exportDataXlsx: () => Blob;
  importDataXlsx: (file: File) => Promise<boolean>;
}

function getActiveScenario(scenarios: Scenario[], id: string): Scenario {
  return scenarios.find(s => s.id === id) ?? scenarios[0];
}

function computeForecasts(state: any) {
  const scenario = getActiveScenario(state.scenarios, state.activeScenarioId);
  const input = {
    profile: state.profile,
    incomes: state.incomes,
    expenses: state.expenses,
    debts: state.debts,
    investments: state.investments,
    retirement: state.retirement,
    scenario,
  };
  return {
    yearlyForecast: generateYearlyForecast(input),
    monthlyForecast: generateMonthlyForecast(input),
  };
}

export const useStore = create<Store>()(
  persist(
    immer((set, get) => ({
      // ── Initial state ──────────────────────────────────
      profile: seedProfile,
      incomes: seedIncomes,
      expenses: seedExpenses,
      debts: seedDebts,
      investments: seedInvestments,
      retirement: seedRetirement,
      tax: seedTax,
      scenarios: seedScenarios,
      activeScenarioId: "base",
      isSeedLoaded: true,
      transactions: [],
      merchantRules: buildDefaultMerchantRules(),
      statementImports: [],
      customExpenseCategories: [],
      yearlyForecast: [],
      monthlyForecast: [],
      localSyncStatus: "idle",
      remoteSyncStatus: "idle",
      lastLocalSaveTime: null,
      lastRemoteSaveTime: null,
      lastSyncError: null,

      // ── Profile ──────────────────────────────────────
      setProfile: (p) => set((state) => {
        Object.assign(state.profile, p);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Income ───────────────────────────────────────
      addIncome: (item) => set((state) => {
        state.incomes.push({ ...item, id: uuid() });
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      updateIncome: (id, item) => set((state) => {
        const idx = state.incomes.findIndex(i => i.id === id);
        if (idx >= 0) Object.assign(state.incomes[idx], item);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      deleteIncome: (id) => set((state) => {
        state.incomes = state.incomes.filter(i => i.id !== id);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Expense ──────────────────────────────────────
      addExpense: (item) => set((state) => {
        state.expenses.push({ ...item, id: uuid() });
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      updateExpense: (id, item) => set((state) => {
        const idx = state.expenses.findIndex(i => i.id === id);
        if (idx >= 0) Object.assign(state.expenses[idx], item);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      deleteExpense: (id) => set((state) => {
        state.expenses = state.expenses.filter(i => i.id !== id);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Custom expense categories ────────────────────
      addExpenseCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const existing = new Set([
          ...(get().customExpenseCategories ?? []).map(c => c.toLowerCase()),
          // BUDGET_CATEGORIES check inline to avoid cyclic import — known list.
          "utilities","food","transport","insurance","housing","entertainment",
          "shopping","travel","family","pet","health","investment","medical","other",
        ]);
        if (existing.has(trimmed.toLowerCase())) return false;
        set((state) => {
          if (!state.customExpenseCategories) state.customExpenseCategories = [];
          state.customExpenseCategories.push(trimmed);
        });
        return true;
      },
      removeExpenseCategory: (name) => set((state) => {
        const usedBy = state.expenses.some(e => e.category === name);
        if (usedBy) return; // refuse — user must reassign first
        state.customExpenseCategories = (state.customExpenseCategories ?? []).filter(c => c !== name);
      }),

      // ── Debt ─────────────────────────────────────────
      addDebt: (item) => set((state) => {
        state.debts.push({ ...item, id: uuid() });
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      updateDebt: (id, item) => set((state) => {
        const idx = state.debts.findIndex(i => i.id === id);
        if (idx >= 0) Object.assign(state.debts[idx], item);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      deleteDebt: (id) => set((state) => {
        state.debts = state.debts.filter(i => i.id !== id);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Investment ────────────────────────────────────
      addInvestment: (item) => set((state) => {
        state.investments.push({ ...item, id: uuid() });
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      updateInvestment: (id, item) => set((state) => {
        const idx = state.investments.findIndex(i => i.id === id);
        if (idx >= 0) Object.assign(state.investments[idx], item);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      deleteInvestment: (id) => set((state) => {
        state.investments = state.investments.filter(i => i.id !== id);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Retirement / Tax ──────────────────────────────
      setRetirement: (r) => set((state) => {
        Object.assign(state.retirement, r);
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      setTax: (t) => set((state) => { Object.assign(state.tax, t); }),

      // ── Scenarios ────────────────────────────────────
      addScenario: (s) => set((state) => {
        state.scenarios.push({ ...s, id: uuid(), createdAt: new Date().toISOString() });
      }),
      updateScenario: (id, s) => set((state) => {
        const idx = state.scenarios.findIndex(i => i.id === id);
        if (idx >= 0) Object.assign(state.scenarios[idx], s);
        if (state.activeScenarioId === id) {
          const f = computeForecasts(state as any);
          state.yearlyForecast = f.yearlyForecast;
          state.monthlyForecast = f.monthlyForecast;
        }
      }),
      deleteScenario: (id) => set((state) => {
        if (state.scenarios.length <= 1) return;
        state.scenarios = state.scenarios.filter(i => i.id !== id);
        if (state.activeScenarioId === id) {
          state.activeScenarioId = state.scenarios[0].id;
          const f = computeForecasts(state as any);
          state.yearlyForecast = f.yearlyForecast;
          state.monthlyForecast = f.monthlyForecast;
        }
      }),
      setActiveScenario: (id) => set((state) => {
        state.activeScenarioId = id;
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Actuals ───────────────────────────────────────
      importStatement: (statement, txns) => {
        const id = uuid();
        let added = 0;
        let duplicates = 0;
        set((state) => {
          const existing = new Set(state.transactions.map((t: Transaction) => t.dedupeKey));
          const rules = state.merchantRules as MerchantRule[];
          for (const t of txns) {
            if (existing.has(t.dedupeKey)) { duplicates++; continue; }
            const upper = t.merchantKey.toUpperCase();
            let bestRule: MerchantRule | null = null;
            for (const r of rules) {
              if (upper.includes(r.pattern.toUpperCase())) {
                if (!bestRule || r.pattern.length > bestRule.pattern.length) bestRule = r;
              }
            }
            const finalCat = bestRule ? bestRule.category : t.category;
            if (bestRule) bestRule.hits = (bestRule.hits ?? 0) + 1;
            state.transactions.push({
              ...t,
              category: finalCat,
              statementImportId: id,
              confidence: bestRule ? 1 : t.confidence,
            });
            existing.add(t.dedupeKey);
            added++;
          }
          state.statementImports.push({
            ...statement,
            id,
            importedAt: new Date().toISOString(),
            transactionCount: added,
            duplicatesSkipped: duplicates,
          });
          state.transactions.sort((a: Transaction, b: Transaction) =>
            (b.postDate || "").localeCompare(a.postDate || "")
          );
        });
        // Belt-and-braces: flush to localStorage + server immediately, in
        // addition to whatever AutoSync's debounce eventually does. This
        // is what makes the import survive a fast nav-away (faster than
        // the 800ms AutoSync debounce). Fire-and-forget — UI doesn't wait.
        get().saveUserNamespaceAsync().catch((err) => {
          console.error("[importStatement] immediate save failed", err);
        });
        return { added, duplicates, statementImportId: id };
      },

      recategorizeTransaction: (txnId, newCategory, learnRule = true) => set((state) => {
        const idx = state.transactions.findIndex((t: Transaction) => t.id === txnId);
        if (idx < 0) return;
        const txn = state.transactions[idx];
        txn.category = newCategory;
        txn.confidence = 1;
        if (learnRule && txn.merchantKey) {
          const pattern = txn.merchantKey.slice(0, 24).trim();
          const existing = state.merchantRules.find((r: MerchantRule) => r.pattern === pattern);
          if (existing) {
            existing.category = newCategory;
            existing.source = "user";
          } else {
            state.merchantRules.push(newMerchantRule(pattern, newCategory, "user"));
          }
        }
      }),

      deleteTransaction: (txnId) => set((state) => {
        state.transactions = state.transactions.filter((t: Transaction) => t.id !== txnId);
      }),

      clearMonthTransactions: (billingMonth, accountId) => set((state) => {
        // When accountId is provided, only clear that account's transactions for the month.
        // This prevents cross-account data loss when multiple users share the same store.
        state.transactions = state.transactions.filter((t: Transaction) => {
          if (t.billingMonth !== billingMonth) return true;          // different month — keep
          if (!accountId) return false;                              // no scope — clear all (legacy)
          return t.accountId !== accountId;                         // different account — keep
        });
      }),

      deleteStatementImport: (statementId) => set((state) => {
        const stmt = state.statementImports.find((s: StatementImport) => s.id === statementId);
        if (!stmt) return;
        // Remove the statement record itself
        state.statementImports = state.statementImports.filter(
          (s: StatementImport) => s.id !== statementId
        );
        // Remove all transactions that came from this statement import
        state.transactions = state.transactions.filter(
          (t: Transaction) => t.statementImportId !== statementId
        );
      }),

      addMerchantRule: (pattern, category, isEssential) => set((state) => {
        const p = pattern.toUpperCase().trim();
        const existing = state.merchantRules.find((r: MerchantRule) => r.pattern === p);
        if (existing) {
          existing.category = category;
          existing.isEssential = isEssential;
          existing.source = "user";
        } else {
          state.merchantRules.push(newMerchantRule(p, category, "user", isEssential));
        }
      }),

      removeMerchantRule: (ruleId) => set((state) => {
        state.merchantRules = state.merchantRules.filter((r: MerchantRule) => r.id !== ruleId);
      }),

      reapplyRules: () => set((state) => {
        const rules = state.merchantRules as MerchantRule[];
        for (const t of state.transactions as Transaction[]) {
          const upper = t.merchantKey.toUpperCase();
          let best: MerchantRule | null = null;
          for (const r of rules) {
            if (upper.includes(r.pattern.toUpperCase())) {
              if (!best || r.pattern.length > best.pattern.length) best = r;
            }
          }
          if (best) {
            t.category = best.category;
            t.confidence = 1;
          }
        }
      }),

      // ── Forecast ─────────────────────────────────────
      recomputeForecast: () => set((state) => {
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),

      // ── Utility ──────────────────────────────────────
      loadUserNamespace: async () => {
        const session = getSession();
        if (!session) return;

        // Try loading from remote first
        const remoteResult = await loadRemoteUserData(session.storageKey);
        let data = null;

        if (remoteResult.ok && remoteResult.data) {
          data = remoteResult.data;
          // Sync remote data back to localStorage
          persistUserData(session.storageKey, data);
        } else {
          // Fall back to localStorage
          data = loadUserData(session.storageKey);
        }

        if (!data) {
          set((state) => {
            state.localSyncStatus = "idle";
            state.remoteSyncStatus = "idle";
          });
          return;
        }

        // Defensive merge: when remote returns an EMPTY array for a list
        // slice but local in-memory state already has items, KEEP local.
        // This protects against the case where:
        //   - User imports a statement (state.transactions = 100 items, persist
        //     middleware saves to localStorage immediately).
        //   - User closes the tab BEFORE the 800ms AutoSync debounce flushes
        //     to /api/sync, so remote still has transactions: [].
        //   - User reopens app → persist hydrates state from localStorage
        //     (good, has 100 items) → loadUserNamespace fetches remote
        //     (transactions: []) → naive overwrite would WIPE the 100 items.
        // Solution: only overwrite a list slice when remote has items, OR
        // when local is also empty.
        const preferRemoteList = <T,>(remote: T[] | undefined, local: T[]): T[] | null => {
          if (!Array.isArray(remote)) return null; // remote didn't include this slice → keep local
          if (remote.length > 0) return remote;     // remote has data → take it (authoritative)
          if (local.length === 0) return remote;    // both empty → no-op
          return null;                              // remote empty, local has data → keep local
        };

        set((state) => {
          if (data.profile) state.profile = data.profile;
          if (data.incomes) state.incomes = data.incomes;
          if (data.expenses) state.expenses = data.expenses;
          if (data.debts) state.debts = data.debts;
          if (data.investments) state.investments = data.investments;
          if (data.retirement) state.retirement = data.retirement;
          if (data.tax) state.tax = data.tax;
          if (data.scenarios) state.scenarios = data.scenarios;
          if (data.activeScenarioId) state.activeScenarioId = data.activeScenarioId;

          const txns = preferRemoteList(data.transactions, state.transactions);
          if (txns !== null) state.transactions = txns;
          const rules = preferRemoteList(data.merchantRules, state.merchantRules);
          if (rules !== null) state.merchantRules = rules;
          const imports = preferRemoteList(data.statementImports, state.statementImports);
          if (imports !== null) state.statementImports = imports;
          if (Array.isArray(data.customExpenseCategories)) {
            state.customExpenseCategories = data.customExpenseCategories;
          }

          const f = computeForecasts(state as any);
          state.yearlyForecast = f.yearlyForecast;
          state.monthlyForecast = f.monthlyForecast;
          state.localSyncStatus = "idle";
          state.remoteSyncStatus = "idle";
        });
      },
      saveUserNamespace: () => {
        const session = getSession();
        if (!session) return;
        const s = get();
        persistUserData(session.storageKey, {
          profile: s.profile, incomes: s.incomes, expenses: s.expenses,
          debts: s.debts, investments: s.investments, retirement: s.retirement,
          tax: s.tax, scenarios: s.scenarios, activeScenarioId: s.activeScenarioId,
          transactions: s.transactions, merchantRules: s.merchantRules,
          statementImports: s.statementImports,
          customExpenseCategories: s.customExpenseCategories,
        });
      },
      saveUserNamespaceAsync: async () => {
        const session = getSession();
        if (!session) return;
        const s = get();
        const data = {
          profile: s.profile, incomes: s.incomes, expenses: s.expenses,
          debts: s.debts, investments: s.investments, retirement: s.retirement,
          tax: s.tax, scenarios: s.scenarios, activeScenarioId: s.activeScenarioId,
          transactions: s.transactions, merchantRules: s.merchantRules,
          statementImports: s.statementImports,
          customExpenseCategories: s.customExpenseCategories,
        };

        // ── LOCAL ──
        set((state) => { state.localSyncStatus = "saving"; });
        try {
          persistUserData(session.storageKey, data);
          set((state) => {
            state.localSyncStatus = "completed";
            state.lastLocalSaveTime = new Date().toISOString();
          });
        } catch (err) {
          set((state) => {
            state.localSyncStatus = "error";
            state.lastSyncError = `Local save failed: ${String(err)}`;
          });
        }

        // ── REMOTE ──
        set((state) => { state.remoteSyncStatus = "saving"; });
        const remoteResult = await saveRemoteUserData(session.storageKey, data);
        if (remoteResult.ok) {
          set((state) => {
            state.remoteSyncStatus = "completed";
            state.lastRemoteSaveTime = new Date().toISOString();
          });
        } else {
          set((state) => {
            state.remoteSyncStatus = "error";
            state.lastSyncError = remoteResult.error || "Remote sync failed";
          });
        }

        // Keep the "completed"/"error" state visible for 4s so the user sees
        // the confirmation, then drop back to "idle". Timestamps stay set so
        // the badge continues to render "Saved 10:23 AM" afterwards.
        setTimeout(() => {
          set((state) => {
            if (state.localSyncStatus === "completed") state.localSyncStatus = "idle";
            if (state.remoteSyncStatus === "completed") state.remoteSyncStatus = "idle";
          });
        }, 4000);
      },
      loadSeedData: () => set((state) => {
        state.profile = seedProfile;
        state.incomes = seedIncomes;
        state.expenses = seedExpenses;
        state.debts = seedDebts;
        state.investments = seedInvestments;
        state.retirement = seedRetirement;
        state.tax = seedTax;
        state.scenarios = seedScenarios;
        state.activeScenarioId = "base";
        state.isSeedLoaded = true;
        // NB: keep historical transactions/imports — never reset by seed reload.
        if (!state.merchantRules || state.merchantRules.length === 0) {
          state.merchantRules = buildDefaultMerchantRules();
        }
        const f = computeForecasts(state as any);
        state.yearlyForecast = f.yearlyForecast;
        state.monthlyForecast = f.monthlyForecast;
      }),
      exportData: () => {
        const s = get();
        return JSON.stringify({
          profile: s.profile, incomes: s.incomes, expenses: s.expenses,
          debts: s.debts, investments: s.investments, retirement: s.retirement,
          tax: s.tax, scenarios: s.scenarios,
          transactions: s.transactions, merchantRules: s.merchantRules,
          statementImports: s.statementImports,
        }, null, 2);
      },
      importData: (json) => {
        let success = false;
        set((state) => {
          try {
            const data = JSON.parse(json);
            if (data.profile) state.profile = data.profile;
            if (data.incomes) state.incomes = data.incomes;
            if (data.expenses) state.expenses = data.expenses;
            if (data.debts) state.debts = data.debts;
            if (data.investments) state.investments = data.investments;
            if (data.retirement) state.retirement = data.retirement;
            if (data.tax) state.tax = data.tax;
            if (data.scenarios) state.scenarios = data.scenarios;
            if (data.transactions) state.transactions = data.transactions;
            if (data.merchantRules) state.merchantRules = data.merchantRules;
            if (data.statementImports) state.statementImports = data.statementImports;
            const f = computeForecasts(state as any);
            state.yearlyForecast = f.yearlyForecast;
            state.monthlyForecast = f.monthlyForecast;
            success = true;
          } catch (e) {
            console.error("Import failed:", e);
            success = false;
          }
        });
        return success;
      },

      exportDataXlsx: () => {
        const XLSX = require("xlsx");
        const s = get();
        const wb = XLSX.utils.book_new();
        const objToKV = (o: any) => Object.entries(o).map(([key, value]) => ({ key, value }));

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(objToKV(s.profile)), "profile");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.incomes), "incomes");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.expenses), "expenses");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.debts), "debts");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.investments), "investments");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(objToKV(s.retirement)), "retirement");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(objToKV(s.tax)), "tax");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.scenarios.map(sc => ({
          id: sc.id, name: sc.name, description: sc.description, isBase: sc.isBase,
          color: sc.color, assumptionsJSON: JSON.stringify(sc.assumptions), createdAt: sc.createdAt,
        }))), "scenarios");

        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      },

      importDataXlsx: async (file: File) => {
        let success = false;
        try {
          const XLSX = require("xlsx");
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sheet = (n: string) => wb.Sheets[n] ? XLSX.utils.sheet_to_json<any>(wb.Sheets[n]) : [];
          const kvToObj = (rows: any[]) => rows.reduce((a, { key, value }) => ({ ...a, [key]: value }), {});

          const incomes = sheet("incomes");
          const expenses = sheet("expenses");
          const debts = sheet("debts");
          const investments = sheet("investments");
          const profile = kvToObj(sheet("profile"));
          const retirement = kvToObj(sheet("retirement"));
          const tax = kvToObj(sheet("tax"));
          const scenarios = sheet("scenarios").map(r => ({
            ...r, assumptions: JSON.parse(r.assumptionsJSON || "{}"),
          }));

          set((state) => {
            if (Object.keys(profile).length) state.profile = profile as any;
            if (incomes.length) state.incomes = incomes as any;
            if (expenses.length) state.expenses = expenses as any;
            if (debts.length) state.debts = debts as any;
            if (investments.length) state.investments = investments as any;
            if (Object.keys(retirement).length) state.retirement = retirement as any;
            if (Object.keys(tax).length) state.tax = tax as any;
            if (scenarios.length) state.scenarios = scenarios as any;
            const f = computeForecasts(state as any);
            state.yearlyForecast = f.yearlyForecast;
            state.monthlyForecast = f.monthlyForecast;
          });
          success = true;
        } catch (e) {
          console.error("XLSX import failed:", e);
        }
        return success;
      },

      // ── Sync Status Setters ──────────────────────────
      setLocalSyncStatus: (status, error) => set((state) => {
        state.localSyncStatus = status;
        if (status === "completed") {
          state.lastLocalSaveTime = new Date().toISOString();
          state.lastSyncError = null;
        }
        if (status === "error") {
          state.lastSyncError = error || "Local save failed";
        }
      }),
      setRemoteSyncStatus: (status, error) => set((state) => {
        state.remoteSyncStatus = status;
        if (status === "completed") {
          state.lastRemoteSaveTime = new Date().toISOString();
          state.lastSyncError = null;
        }
        if (status === "error") {
          state.lastSyncError = error || "Remote save failed";
        }
      }),
    })),
    {
      name: "financial-planner-storage-v3",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return {
          getItem: () => null, setItem: () => {}, removeItem: () => {},
        };
        return localStorage;
      }),
      partialize: (state) => ({
        profile: state.profile,
        incomes: state.incomes,
        expenses: state.expenses,
        debts: state.debts,
        investments: state.investments,
        retirement: state.retirement,
        tax: state.tax,
        scenarios: state.scenarios,
        activeScenarioId: state.activeScenarioId,
        isSeedLoaded: state.isSeedLoaded,
        transactions: state.transactions,
        merchantRules: state.merchantRules,
        statementImports: state.statementImports,
        customExpenseCategories: state.customExpenseCategories,
        // Exclude sync status from persisted state
        // (localSyncStatus, remoteSyncStatus, lastLocalSaveTime, lastRemoteSaveTime, lastSyncError)
      }),
    }
  )
);

// ── Selectors ─────────────────────────────────────────────
export const selectActiveScenario = (s: Store) =>
  s.scenarios.find(sc => sc.id === s.activeScenarioId) ?? s.scenarios[0];

export const selectMortgage = (s: Store) =>
  s.debts.find(d => d.debtType === "mortgage" && d.isActive);

export const selectTotalMonthlyIncome = (s: Store) =>
  s.incomes.filter(i => i.isActive).reduce((sum, i) => {
    if (i.frequency === "yearly") return sum + i.amount / 12;
    if (i.frequency === "one-time") return sum;
    return sum + i.amount;
  }, 0);

export const selectTotalMonthlyExpenses = (s: Store) =>
  s.expenses.filter(e => e.isActive).reduce((sum, e) => {
    if (e.frequency === "yearly") return sum + e.amount / 12;
    if (e.frequency === "one-time") return sum;
    return sum + e.amount;
  }, 0);

export const selectTotalMonthlyDebtPayments = (s: Store) =>
  s.debts.filter(d => d.isActive).reduce(
    (sum, d) => sum + d.standardMonthlyPayment + d.extraMonthlyPayment,
    0
  );

export const selectTotalDebtBalance = (s: Store) =>
  s.debts.filter(d => d.isActive).reduce((sum, d) => sum + d.currentBalance, 0);

export const selectTotalInvestmentValue = (s: Store) =>
  s.investments.filter(i => i.isActive).reduce((sum, i) => sum + i.marketValue, 0);

export const selectNetWorth = (s: Store) => {
  const assets = s.investments.filter(i => i.isActive).reduce((sum, i) => sum + i.marketValue, 0);
  const liabilities = s.debts.filter(d => d.isActive).reduce((sum, d) => sum + d.currentBalance, 0);
  return assets - liabilities;
};

// ── Account-Filtered Selectors (NEW) ──────────────────
/**
 * Get transactions for the active account only.
 * Required for per-user isolation in statement imports.
 */
export const useTransactionsForActiveAccount = (accountId: string) => {
  const store = useStore();
  return store.transactions.filter(t => t.accountId === accountId);
};

/**
 * Get statement imports for the active account only.
 * Required for per-user isolation.
 */
export const useImportsForActiveAccount = (accountId: string) => {
  const store = useStore();
  return store.statementImports.filter(i => i.accountId === accountId);
};

/**
 * Selector function: filter transactions by accountId.
 * Usage: const filtered = selectTransactionsForAccount(store, accountId);
 */
export const selectTransactionsForAccount = (s: Store, accountId: string) =>
  s.transactions.filter(t => t.accountId === accountId);

/**
 * Selector function: filter imports by accountId.
 * Usage: const filtered = selectImportsForAccount(store, accountId);
 */
export const selectImportsForAccount = (s: Store, accountId: string) =>
  s.statementImports.filter(i => i.accountId === accountId);
