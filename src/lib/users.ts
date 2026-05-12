/**
 * MULTI-USER REGISTRY
 * Stored in localStorage under USERS_KEY.
 * Admin (toy) can manage accounts from /accounts page.
 */
import { sha256 } from "./auth";
import { seedProfile, seedIncomes, seedExpenses, seedDebts, seedInvestments, seedRetirement, seedTax, seedScenarios } from "./seed";
import { toyRealData, looksLikeDemoData } from "./toyRealData";

export type UserRole = "admin" | "member" | "demo";
export type DataMode = "real" | "own" | "demo";

export interface AppUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  dataMode: DataMode;
  storageKey: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

const isClient = typeof window !== "undefined";
function safeGet(key: string): string | null {
  return isClient ? localStorage.getItem(key) : null;
}
function safeSet(key: string, val: string): void {
  if (isClient) localStorage.setItem(key, val);
}
function safeRemove(key: string): void {
  if (isClient) localStorage.removeItem(key);
}


export const USERS_KEY = "fp_users_v1";
export const CURRENT_USER_KEY = "fp_current_user";

/**
 * Default users pre-seeded on first load.
 *
 * Only the admin (Toy) is seeded. Demo accounts were removed 2026-04-20 —
 * previously seeding Demo Member + Demo User here caused a resurrection bug:
 * any time the Cloudflare KV registry was unreachable or empty on first load,
 * the client would seed DEFAULT_USERS locally AND push them to the server
 * registry via syncRegistryRemote(), undoing admin deletions across restarts.
 */
export const DEFAULT_USERS: Omit<AppUser, "passwordHash">[] = [
  {
    id: "user_toy",
    username: "toy",
    email: "toy.theeranan@icloud.com",
    displayName: "Toy Theeranan",
    role: "admin",
    dataMode: "real",
    storageKey: "fp_data_toy",
    createdAt: "2025-04-14T00:00:00Z",
    isActive: true,
  },
];

export function getUsers(): AppUser[] {
  try {
    const raw = safeGet(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export function saveUsers(users: AppUser[]) {
  safeSet(USERS_KEY, JSON.stringify(users));
}

export function getUserById(id: string): AppUser | undefined {
  return getUsers().find(u => u.id === id);
}

export function getUserByUsername(username: string): AppUser | undefined {
  return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
}

export function getUserByEmail(email: string): AppUser | undefined {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function updateUser(id: string, patch: Partial<AppUser>) {
  const users = getUsers().map(u => u.id === id ? { ...u, ...patch } : u);
  saveUsers(users);
}

/**
 * Create a new AppUser record in localStorage and seed an empty data namespace for them.
 * The caller provides the plaintext password; we hash it here.
 * Returns { ok: true, user } on success, or { ok: false, error } on validation failure.
 */
export async function addUser(input: {
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  password: string;
}): Promise<{ ok: true; user: AppUser } | { ok: false; error: string }> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!username) return { ok: false, error: "Username is required" };
  if (!email) return { ok: false, error: "Email is required" };
  if (!displayName) return { ok: false, error: "Display name is required" };
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters" };
  }

  const existing = getUsers();
  if (existing.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: `Username "${username}" already taken` };
  }
  if (existing.some(u => u.email.toLowerCase() === email)) {
    return { ok: false, error: `Email "${email}" already registered` };
  }

  const id = `user_${username.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
  const storageKey = `fp_data_${id}`; // 🔐 Use unique ID, not username (prevents collisions)
  const passwordHash = await sha256(input.password);

  const newUser: AppUser = {
    id,
    username,
    email,
    displayName,
    passwordHash,
    role: input.role,
    dataMode: input.role === "demo" ? "demo" : "own",
    storageKey,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  saveUsers([...existing, newUser]);
  persistUserData(storageKey, getStartingSnapshot(newUser.role, newUser.displayName));

  return { ok: true, user: newUser };
}

export function removeUser(id: string) {
  const user = getUserById(id);
  if (!user) return false;

  const users = getUsers().filter(u => u.id !== id);
  saveUsers(users);

  safeRemove(user.storageKey);

  if (getCurrentUserId() === id) {
    safeRemove(CURRENT_USER_KEY);
  }

  return true;
}

export function setCurrentUserId(id: string) {
  safeSet(CURRENT_USER_KEY, id);
}

export function getCurrentUserId(): string | null {
  return safeGet(CURRENT_USER_KEY);
}

export function loadUserData(storageKey: string): any | null {
  try {
    const raw = safeGet(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function persistUserData(storageKey: string, data: any) {
  safeSet(storageKey, JSON.stringify(data));
}

export function getDemoSnapshot() {
  return {
    profile: { ...seedProfile, fullName: "Demo User", dateOfBirth: "1992-06-15", currentCashBalance: 350000 },
    incomes: seedIncomes,
    expenses: seedExpenses,
    debts: seedDebts,
    investments: seedInvestments,
    retirement: seedRetirement,
    tax: seedTax,
    scenarios: seedScenarios,
    activeScenarioId: "base",
  };
}

/**
 * Empty starting snapshot for newly-created member/admin accounts.
 * Members should NOT inherit "Demo User" fixture data - they start blank
 * and fill in their own profile + financials. Only role="demo" gets demo seed.
 */
export function getEmptySnapshot(displayName: string = "") {
  return {
    profile: {
      id: crypto.randomUUID ? crypto.randomUUID() : `profile_${Date.now()}`,
      fullName: displayName,
      dateOfBirth: "",
      retirementAge: 60,
      lifeExpectancy: 85,
      country: "",
      currency: "THB" as const,
      planningStartDate: new Date().toISOString().slice(0, 10),
      maritalStatus: "Single",
      householdNotes: "",
      emergencyFundTargetMonths: 6,
      targetMinCashBalance: 0,
      riskProfile: "moderate" as const,
      notes: "",
      currentCashBalance: 0,
    },
    incomes: [],
    expenses: [],
    debts: [],
    investments: [],
    retirement: {
      retirementAge: 60,
      expectedAnnualExpense: 0,
      inflationRate: 0.03,
      portfolioReturnPreRetirement: 0.06,
      portfolioReturnDuringRetirement: 0.04,
      safeWithdrawalRate: 0.04,
      pensionMonthlyAmount: 0,
      ssoMonthlyBenefit: 0,
    },
    tax: {
      annualGrossIncome: 0,
      personalDeduction: 60_000,
      employmentIncomeDeduction: 100_000,
      pvdContribution: 0,
      rmfContribution: 0,
      ssfContribution: 0,
      lifeInsurancePremium: 0,
      healthInsurancePremium: 0,
      mortgageInterestDeduction: 0,
      parentalDeduction: 0,
      childDeduction: 0,
      otherDeductions: 0,
      annualBonus: 0,
    },
    scenarios: [
      {
        id: "base",
        name: "Base Case",
        description: "Your starting plan",
        isBase: true,
        color: "#3b82f6",
        tag: "custom" as const,
        clusters: [],
        riskLevel: "medium" as const,
        timeHorizon: "long" as const,
        assumptions: {
          incomeGrowthRate: 0.03,
          inflationRate: 0.03,
          investmentReturnRate: 0.06,
        },
        createdAt: new Date().toISOString(),
      },
    ],
    activeScenarioId: "base",
    transactions: [],
    merchantRules: [],
    statementImports: [],
    customExpenseCategories: [],
    yearlyForecast: [],
    monthlyForecast: [],
  };
}

/** Pick the right starter snapshot based on role + displayName. */
export function getStartingSnapshot(role: UserRole, displayName: string = "") {
  return role === "demo" ? getDemoSnapshot() : getEmptySnapshot(displayName);
}

export async function saveRemoteUserData(storageKey: string, data: any): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  // 🔐 Don't push seed data over real server data. Wait until we've
  // confirmed what the server has for this user via a successful GET /api/sync.
  // Without this gate, the auto-sync timer can push seed ("Somchai") to the server
  // before the post-login remote read completes, corrupting the user's row.
  if (isClient) {
    try {
      const { useStore } = await import("./store");
      const { isHydratedFromRemote } = useStore.getState();
      if (!isHydratedFromRemote) {
        console.log(`[saveRemoteUserData] Skipping POST — not yet hydrated from remote for ${storageKey}`);
        return { ok: false, error: "Not yet hydrated from remote" };
      }
    } catch { /* non-fatal — continue with POST */ }
  }

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageKey, data }),
    });
    const text = await response.text().catch(() => "");
    let result: any = null;
    if (text) {
      try { result = JSON.parse(text); } catch { /* non-JSON response */ }
    }
    if (!response.ok) {
      const msg = result?.error
        ?? (response.status === 404
          ? "POST /api/sync - 404 (Pages Function missing - redeploy?)"
          : `POST /api/sync - HTTP ${response.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
      return { ok: false, error: msg };
    }
    return result ?? { ok: true };
  } catch (error) {
    console.error("[saveRemoteUserData] Error:", error);
    return { ok: false, error: `network: ${String(error)}` };
  }
}

export async function loadRemoteUserData(storageKey: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(`/api/sync?storageKey=${encodeURIComponent(storageKey)}`);
    const text = await response.text().catch(() => "");
    let result: any = null;
    if (text) {
      try { result = JSON.parse(text); } catch { /* non-JSON */ }
    }
    if (!response.ok) {
      const msg = result?.error
        ?? (response.status === 404
          ? "not_found"
          : `GET /api/sync - HTTP ${response.status}`);
      return { ok: false, error: msg };
    }
    return result ?? { ok: false, error: "empty response" };
  } catch (error) {
    console.error("[loadRemoteUserData] Error:", error);
    return { ok: false, error: `network: ${String(error)}` };
  }
}

export async function initUsers(toyPasswordHash: string): Promise<void> {
  const existing = getUsers();

  if (existing.length === 0) {
    const remote = await syncFetchUsersRemote();

    if (remote.ok) {
      saveUsers(remote.users);
      for (const u of remote.users) {
        if (!loadUserData(u.storageKey)) {
          if (u.id === "user_toy") persistUserData(u.storageKey, toyRealData);
          else persistUserData(u.storageKey, getStartingSnapshot(u.role, u.displayName));
        }
      }
    } else {
      const seeded: AppUser[] = [
        { ...DEFAULT_USERS[0], passwordHash: toyPasswordHash },
      ];
      saveUsers(seeded);
      persistUserData(DEFAULT_USERS[0].storageKey, toyRealData);
    }
    return;
  }

  if (toyPasswordHash) {
    const users = existing.map(u =>
      u.id === "user_toy" ? { ...u, passwordHash: toyPasswordHash } : u
    );
    saveUsers(users);
  }

  const toyData = loadUserData(DEFAULT_USERS[0].storageKey);
  if (!toyData || looksLikeDemoData(toyData)) {
    console.warn("[initUsers] Toy namespace has demo/seed data - restoring real data.");
    persistUserData(DEFAULT_USERS[0].storageKey, toyRealData);
  }
}

async function readJsonSafely(res: Response): Promise<{
  status: number;
  ok: boolean;
  json: any | null;
  text: string;
}> {
  const text = await res.text().catch(() => "");
  if (!text) {
    return { status: res.status, ok: res.ok, json: null, text: "" };
  }
  try {
    return { status: res.status, ok: res.ok, json: JSON.parse(text), text };
  } catch {
    return { status: res.status, ok: res.ok, json: null, text };
  }
}

function describeHttpError(
  method: string,
  path: string,
  safe: { status: number; json: any; text: string },
): string {
  if (safe.json?.error) return safe.json.error;
  if (safe.status === 404) {
    return `${method} ${path} - 404 (endpoint not found on server - likely the Cloudflare Pages Function for ${path} is missing or the site wasn't redeployed)`;
  }
  if (safe.status === 0) return `${method} ${path} - network error`;
  const snippet = safe.text?.slice(0, 120) ?? "";
  return `${method} ${path} - HTTP ${safe.status}${snippet ? `: ${snippet}` : ""}`;
}

export async function syncFetchUsersRemote(): Promise<
  { ok: true; users: AppUser[] } | { ok: false; error: string }
> {
  try {
    const res = await fetch("/api/admin/users", { method: "GET" });
    const safe = await readJsonSafely(res);
    if (!safe.ok) return { ok: false, error: describeHttpError("GET", "/api/admin/users", safe) };
    const raw = Array.isArray(safe.json?.users) ? safe.json.users : [];
    const users: AppUser[] = raw.map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      passwordHash: u.passwordHash ?? "",
      role: u.role,
      dataMode: u.dataMode ?? "demo",
      storageKey: u.storageKey ?? `fp_data_${String(u.username || "").toLowerCase()}`,
      createdAt: u.createdAt ?? u.created_at ?? new Date().toISOString(),
      lastLogin: u.lastLogin,
      isActive: u.isActive !== false,
    }));
    return { ok: true, users };
  } catch (err) {
    return { ok: false, error: `network: ${String(err)}` };
  }
}

/**
 * @param password Plaintext password used to provision the Supabase Auth
 * user on the server. Without this, the user can't actually log in
 * (signInWithPassword checks auth.users, not app_users.password_hash).
 */
export async function syncAddUserRemote(
  user: AppUser,
  password?: string,
): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    const safe = await readJsonSafely(res);
    if (!safe.ok) return { ok: false, error: describeHttpError("POST", "/api/admin/users", safe) };
    return { ok: true, savedAt: safe.json?.savedAt };
  } catch (err) {
    return { ok: false, error: `network: ${String(err)}` };
  }
}

/**
 * @param password Optional plaintext password. If provided, the server will
 * also call supabase.auth.admin.updateUserById() so the new password
 * actually works at login (or createUser if no auth row exists yet).
 */
export async function syncUpdateUserRemote(
  id: string,
  patch: Partial<AppUser>,
  password?: string,
): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch, password }),
    });
    const safe = await readJsonSafely(res);
    if (!safe.ok) return { ok: false, error: describeHttpError("PATCH", "/api/admin/users", safe) };
    return { ok: true, savedAt: safe.json?.savedAt };
  } catch (err) {
    return { ok: false, error: `network: ${String(err)}` };
  }
}

export async function syncRemoveUserRemote(
  id: string,
): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const safe = await readJsonSafely(res);
    if (!safe.ok) return { ok: false, error: describeHttpError("DELETE", "/api/admin/users", safe) };
    return { ok: true, savedAt: safe.json?.savedAt };
  } catch (err) {
    return { ok: false, error: `network: ${String(err)}` };
  }
}

export async function syncRegistryRemote(
  users: AppUser[],
): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users }),
    });
    const safe = await readJsonSafely(res);
    if (!safe.ok) return { ok: false, error: describeHttpError("POST", "/api/admin/users", safe) };
    return { ok: true, savedAt: safe.json?.savedAt };
  } catch (err) {
    return { ok: false, error: `network: ${String(err)}` };
  }
}

export async function syncUserData(storageKey: string, data: any) {
  persistUserData(storageKey, data);

  const remoteResult = await saveRemoteUserData(storageKey, data);
  if (remoteResult.ok) {
    console.log(`[syncUserData] Remote sync successful for ${storageKey}`);
  } else {
    console.warn(`[syncUserData] Remote sync failed for ${storageKey}:`, remoteResult.error);
  }

  return remoteResult;
}

export async function scheduleEmail(
  to: string,
  subject: string,
  html: string,
  sendTime: string
): Promise<{ ok: boolean; emailId?: string; error?: string }> {
  try {
    const response = await fetch("/schedule-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html, sendTime }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("[scheduleEmail] Error:", error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Find or create an AppUser by email for Supabase magic-link auth.
 * - If user exists by email, return them.
 * - Else check allowlist; if not on it, return null.
 * - Else create new user with role determined by email, seed data, and sync to remote.
 */
export async function findOrCreateUserByEmail(email: string, supabaseUserId: string): Promise<AppUser | null> {
  const normalizedEmail = email.toLowerCase();

  const existing = getUserByEmail(normalizedEmail);
  if (existing) {
    return existing;
  }

  // Before creating a fresh local AppUser, see if the admin already provisioned
  // one in the remote app_users registry. If so, adopt that row - it has the
  // correct displayName, role, and storage_key.
  try {
    const remote = await syncFetchUsersRemote();
    if (remote.ok) {
      const remoteHit = remote.users.find(
        (u) => u.email?.toLowerCase() === normalizedEmail,
      );
      if (remoteHit) {
        const users = getUsers();
        saveUsers([...users, remoteHit]);
        if (!loadUserData(remoteHit.storageKey)) {
          persistUserData(
            remoteHit.storageKey,
            getStartingSnapshot(remoteHit.role, remoteHit.displayName),
          );
        }
        return remoteHit;
      }
    }
  } catch { /* fall through to fresh create */ }

  const username = normalizedEmail.split("@")[0];
  const id = `user_${supabaseUserId.slice(0, 12)}`;
  const storageKey = `fp_data_${supabaseUserId}`; // 🔐 Use unique supabaseUserId, not username (prevents collisions)

  const isAdminEmail =
    normalizedEmail === "toy.theeranan@gmail.com" ||
    normalizedEmail === "toy.theeranan@icloud.com";

  const newUser: AppUser = {
    id,
    username,
    email: normalizedEmail,
    displayName: username,
    passwordHash: "",
    role: isAdminEmail ? "admin" : "member",
    dataMode: "own",
    storageKey,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  const users = getUsers();
  saveUsers([...users, newUser]);

  // Empty starter for member/admin; demo fixture only for role="demo".
  persistUserData(storageKey, getStartingSnapshot(newUser.role, newUser.displayName));

  await syncAddUserRemote(newUser);

  return newUser;
}
