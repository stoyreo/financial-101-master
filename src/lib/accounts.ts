/**
 * ACCOUNT MANAGEMENT
 * ──────────────────
 * Per-user accounts to ensure data isolation.
 * Each user gets their own account so transactions don't leak between users.
 */

import { getSession } from "./auth";

export type UserRole = "admin";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/**
 * Single account for the Financial 101 Master crafted by Toy app (legacy)
 */
export const MAIN_ACCOUNT: Account = {
  id: "toy",
  name: "Toy Theeranan",
  email: "toy.theeranan@gmail.com",
  role: "admin",
  createdAt: "2024-01-01T00:00:00Z",
};

/**
 * Get the current account based on the authenticated user.
 * 🔐 CRITICAL: Each user has a unique accountId to prevent data leakage.
 * The accountId is used to filter transactions, so different users must have different IDs.
 */
export function getCurrentAccount(): Account {
  const session = getSession();
  if (!session) {
    // Fallback if no session (SSR, etc.)
    return MAIN_ACCOUNT;
  }

  // 🔐 Use userId as accountId to ensure unique per-user isolation
  return {
    id: session.userId,  // Unique per user, not shared
    name: session.username,
    email: "", // Not available in session
    role: session.role as UserRole,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if current account has required access level
 */
export function validateAccess(requiredRole: UserRole): boolean {
  return true; // Always admin
}

/**
 * Get the Toy (admin) account ID.
 * Used by migration logic to assign legacy transactions to the admin account.
 * Returns null if Toy account not found.
 */
export function getToyAccountId(accounts: Account[]): string | null {
  const toy = accounts.find(
    a => a.email === "toy.theeranan@gmail.com" && a.role === "admin"
  ) || accounts.find(a => a.email === "toy.theeranan@gmail.com");
  return toy?.id ?? null;
}
