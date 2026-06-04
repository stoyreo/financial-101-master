/**
 * ACCOUNT MANAGEMENT
 * ──────────────────
 * Per-user accounts to ensure data isolation.
 * Each user gets their own account so transactions don't leak between users.
 */

import { getSession } from "./auth-client";

export type UserRole = "admin";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/**
 * Get the current account based on the authenticated user.
 * 🔐 CRITICAL: Each user has a unique accountId to prevent data leakage.
 * The accountId is used to filter transactions, so different users must have different IDs.
 *
 * Returns null if no session — SSR must never silently use a fallback account.
 * Callers MUST check for null and handle unauthorized access explicitly.
 */
export function getCurrentAccount(): Account | null {
  const session = getSession();
  if (!session) {
    // No session = not authenticated. Return null to force error handling.
    // Never return a hardcoded fallback account (e.g., id="toy") to prevent data leakage.
    return null;
  }

  // 🔐 Use userId as accountId to ensure unique per-user isolation
  return {
    id: session.userId,  // Unique per user, not shared
    name: session.username,
    email: "", // Not available in session
    role: session.role as UserRole,
    createdAt: "", // Not available in session — populated when fetched from app_users DB
  };
}

/**
 * Check if current account has required access level.
 * Returns false if not authenticated or role is insufficient.
 */
export function validateAccess(requiredRole: UserRole): boolean {
  const account = getCurrentAccount();
  if (!account) return false;  // Not authenticated
  // Check if user's role matches required role (currently only "admin" exists)
  return account.role === requiredRole;
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
