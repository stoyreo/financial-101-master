/**
 * CLIENT-SAFE AUTH UTILITIES
 */

import { getCurrentUserId, setCurrentUserId, type AppUser } from "./users";
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

const SESSION_KEY = "fp_session_data";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const userId = getCurrentUserId();
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s: Session = JSON.parse(raw);
      if (s.userId === userId) return s;
    }
  } catch { /* corrupt */ }
  return null;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  try { sessionStorage.removeItem("fp_current_user"); } catch {}
}

export function isAdmin(): boolean {
  return getSession()?.role === "admin";
}

export function synthesizeSession(user: AppUser, _extras?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  setCurrentUserId(user.id);
  const session: Session = {
    userId: user.id,
    username: (user as any).username || (user.email ?? "").split("@")[0] || "user",
    role: (user as any).role || "member",
    email: user.email ?? "",
    displayName: (user as any).displayName || (user as any).display_name || (user as any).username || (user.email ?? "").split("@")[0] || "user",
    storageKey: (user as any).storageKey || (user as any).storage_key || `fp_data_${user.id.slice(0, 8)}`,
  };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

export async function changePassword(userId: string, newPassword: string): Promise<boolean> {
  try {
    const { updateUser } = await import("./users");
    const { sha256 } = await import("./crypto");
    const hash = await sha256(newPassword);
    updateUser(userId, { passwordHash: hash });
    return true;
  } catch { return false; }
}

export async function ensureAppUserFromSupabase(
  email: string,
  supabaseUserId: string,
): Promise<AppUser | null> {
  return findOrCreateUserByEmail(email, supabaseUserId);
}
