/**
 * CLIENT-SAFE AUTH UTILITIES
 * ──────────────────────────
 * Drop-in replacements for the old auth.ts functions that have been
 * removed or made server-only after the Supabase migration.
 * Safe to import from "use client" components.
 */

import { getCurrentUserId, getUserById, setCurrentUserId, type AppUser } from "./users";
import { findOrCreateUserByEmail } from "./users";
export { sha256 } from "./crypto";

export interface Session {
  userId: string;
  username: string;
  role: string;
  email: string;
  displayName: string;
  storageKey: string;
}

export function getSession(): Session | null {
  const userId = getCurrentUserId();
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user || !user.isActive) return null;
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    storageKey: user.storageKey,
  };
}

export function isAdmin(): boolean {
  return getSession()?.role === "admin";
}

export function synthesizeSession(user: AppUser, _extras?: Record<string, unknown>): void {
  setCurrentUserId(user.id);
}

export async function changePassword(userId: string, newPassword: string): Promise<boolean> {
  try {
    const { updateUser } = await import("./users");
    const { sha256 } = await import("./crypto");
    const hash = await sha256(newPassword);
    updateUser(userId, { passwordHash: hash });
    return true;
  } catch {
    return false;
  }
}

/**
 * Client-safe version of ensureAppUserFromSupabase.
 * Finds or creates an AppUser by email. Used in LINE OAuth callback.
 */
export async function ensureAppUserFromSupabase(
  email: string,
  supabaseUserId: string,
): Promise<AppUser | null> {
  return findOrCreateUserByEmail(email, supabaseUserId);
}
