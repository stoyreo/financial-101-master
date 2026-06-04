/**
 * MIGRATION: Per-User Isolation for Imported Statements (v3.2)
 *
 * Assigns all existing transactions without accountId to the authenticated admin account.
 * Runs once per user per browser via a user-scoped localStorage flag.
 */

import { useStore } from "@/lib/store";
import { getSession } from "@/lib/auth-client";

/**
 * One-time migration: assign legacy transactions (without accountId) to the current admin account.
 * Idempotent via a user-scoped localStorage flag so each user's migration state is independent.
 *
 * Security notes:
 * - Requires an active session; no-ops if unauthenticated.
 * - Only runs for admin-role users (legacy data belongs to the admin account).
 * - Uses session.userId (real UUID) instead of the old hardcoded "toy" string.
 * - FLAG is scoped per user so User A's migration does not suppress User B's.
 */
export function migrateLegacyImports() {
  const BASE_FLAG = "f101_migration_v3_2_per_user_imports_done";

  // Only run in browser
  if (typeof window === "undefined") return;

  // Require an authenticated session — never migrate without knowing who the user is
  const session = getSession();
  if (!session) return;

  // This migration only applies to admin users (legacy data belongs to the admin account)
  if (session.role !== "admin") return;

  // Scope the flag per user so each user has an independent migration state
  const FLAG = `${BASE_FLAG}:${session.userId}`;

  // Already migrated for this user
  if (localStorage.getItem(FLAG) === "true") return;

  const state = useStore.getState();

  // Use the real userId (UUID) — never the hardcoded "toy" string
  const toyId = session.userId;

  if (!toyId) {
    console.warn("Migration: session.userId is empty; will retry next boot");
    return;
  }

  const tx = state.transactions ?? [];
  const imports = state.statementImports ?? [];

  // Only migrate transactions that don't have accountId yet
  const fixedTx = tx.map(t =>
    t.accountId ? t : { ...t, accountId: toyId }
  );
  const fixedImports = imports.map(i =>
    i.accountId ? i : { ...i, accountId: toyId }
  );

  // Persist the migration
  useStore.setState({
    transactions: fixedTx,
    statementImports: fixedImports,
  });

  localStorage.setItem(FLAG, "true");
  console.log(`Migration: assigned ${fixedTx.length} transactions and ${fixedImports.length} imports to account ${toyId}`);
}
