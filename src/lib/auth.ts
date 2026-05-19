import { getUserByUsername, setCurrentUserId, getCurrentUserId,
  getUserById, updateUser, persistUserData, loadUserData, getDemoSnapshot, getEmptySnapshot, type AppUser, findOrCreateUserByEmail } from "./users";

export const SESSION_KEY = "fp_auth_session";
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

export interface Session {
  userId: string;
  username: string;
  role: string;
  storageKey: string;
  expiresAt: number;
}

const isClient = typeof window !== "undefined";

// Cached synthesized session from Supabase
let _cachedSession: Session | null = null;

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ensure an AppUser exists for the given Supabase email + userId.
 * Checks allowlist and looks up or creates the user.
 */
export async function ensureAppUserFromSupabase(email: string, supabaseUserId: string): Promise<AppUser | null> {
  const appUser = await findOrCreateUserByEmail(email, supabaseUserId);
  return appUser;
}

/**
 * DEPRECATED: Kill-switched login for backward compatibility.
 * Returns null (no-op). Will be removed in a follow-up PR.
 */
export async function login(username: string, password: string): Promise<AppUser | null> {
  return null;
}

export function getSession(): Session | null {
  if (!isClient) return null;

  // Return cached session if valid
  if (_cachedSession) {
    if (Date.now() <= _cachedSession.expiresAt) {
      return _cachedSession;
    }
    _cachedSession = null;
  }

  // Try reading from sessionStorage
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s: Session = JSON.parse(raw);
      if (Date.now() <= s.expiresAt) {
        _cachedSession = s;
        return s;
      }
    }
  } catch { /* noop */ }

  return null;
}

/**
 * Synthesize a Session from Supabase auth + AppUser registry.
 * Called by middleware/auth callback to populate the session cache.
 */
export function synthesizeSession(appUser: AppUser): Session {
  // 🔐 Reset Zustand to a BLANK snapshot on session synthesis (not Somchai seed).
  // The remote GET /api/sync will hydrate any real data the user has saved.
  if (isClient) {
    // Fire-and-forget: async import to avoid circular dependency
    (async () => {
      try {
        const { useStore } = await import("./store");
        const { getEmptySnapshot } = await import("./users");
        const empty = getEmptySnapshot(appUser.username || "");
        useStore.setState({
          profile: empty.profile,
          incomes: empty.incomes,
          expenses: empty.expenses,
          debts: empty.debts,
          investments: empty.investments,
          retirement: empty.retirement,
          tax: empty.tax,
          scenarios: empty.scenarios,
          activeScenarioId: empty.activeScenarioId,
          isSeedLoaded: false,
          transactions: [],
          merchantRules: [],
          statementImports: [],
          customExpenseCategories: [],
          yearlyForecast: [],
          monthlyForecast: [],
          isHydratedFromRemote: false,
        }); // merge only — do NOT pass replace=true, that wipes all store action functions
        sessionStorage.removeItem("financial-planner-storage-v3");
      } catch { /* non-fatal */ }
    })();
  }

  const session: Session = {
    userId: appUser.id,
    username: appUser.username,
    role: appUser.role,
    storageKey: appUser.storageKey,
    expiresAt: Date.now() + SESSION_TTL,
  };
  if (isClient) {
    _cachedSession = session;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    // Set a cookie so server-side middleware can recognise this session
    document.cookie = `fp_session_exists=1; path=/; max-age=${SESSION_TTL / 1000}; SameSite=Lax`;
  }
  setCurrentUserId(appUser.id);
  return session;
}

export async function clearSession() {
  _cachedSession = null;
  if (!isClient) return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("fp_current_user");
  // Clear the middleware cookie too
  document.cookie = "fp_session_exists=; path=/; max-age=0; SameSite=Lax";

  // 🔐 Clear the Zustand store to prevent the next user from seeing this user's data
  // Use dynamic import to avoid circular dependency: accounts.ts -> auth.ts -> store.ts -> accounts.ts
  try {
    const { useStore } = await import("./store");
    const { getEmptySnapshot } = await import("./users");
    const empty = getEmptySnapshot("");
    useStore.setState({
      profile: empty.profile,
      incomes: empty.incomes,
      expenses: empty.expenses,
      debts: empty.debts,
      investments: empty.investments,
      retirement: empty.retirement,
      tax: empty.tax,
      scenarios: empty.scenarios,
      activeScenarioId: empty.activeScenarioId,
      isSeedLoaded: false,
      transactions: [],
      merchantRules: [],
      statementImports: [],
      customExpenseCategories: [],
      yearlyForecast: [],
      monthlyForecast: [],
      isHydratedFromRemote: false,
    }); // merge only — do NOT pass replace=true
    sessionStorage.removeItem("financial-planner-storage-v3");
  } catch { /* non-fatal */ }

  // Async sign-out from Supabase (fire-and-forget for backward compatibility)
  try {
    const { getSupabaseBrowser } = await import("./supabase/client");
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
  } catch { /* non-fatal */ }
}

export function isAdmin(): boolean {
  if (!isClient) return false;
  return getSession()?.role === "admin";
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const { updateUser } = await import("./users");
  const hash = await sha256(newPassword);
  updateUser(userId, { passwordHash: hash });
}

export async function notifyAccess(user: AppUser) {
  const url = process.env.NEXT_PUBLIC_NOTIFY_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "login",
        user: user.username,
        email: user.email,  // 🔐 REQUIRED: Include user's email so notification worker knows who to send to
        appUrl: window.location.origin,
        loginTime: new Date().toISOString(),
        userAgent: navigator.userAgent,
      }),
    });
  } catch { /* non-fatal */ }
}
