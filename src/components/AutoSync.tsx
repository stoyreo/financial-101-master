"use client";

/**
 * AUTO-SYNC
 * ---------
 * Subscribes to the Zustand store and, whenever any data-bearing slice
 * changes, debounces for a short period and then calls
 * saveUserNamespaceAsync() so the change is persisted both to localStorage
 * AND to the server file (data/user-*.json).
 *
 * It also drives the <SyncStatusBar />, because saveUserNamespaceAsync flips
 * localSyncStatus / remoteSyncStatus on the store as it runs.
 *
 * NOTE on the removed `firstRunRef`: an earlier version skipped the FIRST
 * subscriber invocation on the assumption that it was the hydration pass.
 * That was wrong. Zustand's persist middleware hydrates synchronously
 * during create(), BEFORE this component mounts and subscribes -- so the
 * subscriber never sees the hydration. Skipping the first event instead
 * silently dropped the user's first real action (e.g. their first
 * statement import on a fresh session). Now we let every change through
 * and rely on `dataChanged` + `getSession()` to filter.
 */

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { getSession } from "@/lib/auth-client";

const DEBOUNCE_MS = 800;

export default function AutoSync() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      // Only run if a data-bearing slice actually changed. Ignore
      // forecast recomputes and sync-status flips.
      const dataChanged =
        state.profile !== prev.profile ||
        state.incomes !== prev.incomes ||
        state.expenses !== prev.expenses ||
        state.debts !== prev.debts ||
        state.investments !== prev.investments ||
        state.retirement !== prev.retirement ||
        state.tax !== prev.tax ||
        state.scenarios !== prev.scenarios ||
        state.activeScenarioId !== prev.activeScenarioId ||
        state.transactions !== prev.transactions ||
        state.merchantRules !== prev.merchantRules ||
        state.statementImports !== prev.statementImports;

      if (!dataChanged) return;
      if (!getSession()) return; // not logged in -> nothing to save

      // Debounce: coalesce a burst of edits into one save.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        useStore.getState().saveUserNamespaceAsync().catch((err) => {
          console.error("[AutoSync] save failed", err);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return null;
}
