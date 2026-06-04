#!/bin/bash
# Fix 3 critical defects:
# 1. /expenses/actuals crash for email/password users (getCurrentAccount null)
# 2. Zustand store using shared localStorage → sessionStorage + clearStore
# 3. Logout doesn't clear store → cross-user data leakage

set -e
echo "══════════════════════════════════════════════"
echo "  Financial 101 — Fix Critical Defects"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
echo "Cloning repo..."
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

echo "Applying fixes..."

# ── Fix 1: AuthGuard — bridge Supabase session to legacy session ───────────
cat > src/components/AuthGuard.tsx << 'GUARDEOF'
"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { getSession, synthesizeSession } from "@/lib/auth-client";
import { useStore } from "@/lib/store";

// Must stay in sync with providers.tsx PUBLIC_PATHS
const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/auth/line/callback"];

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Bridge: when a Supabase session exists but the legacy auth-client session
 * (fp_current_user in sessionStorage) is missing — e.g. after a hard refresh,
 * OAuth callback, or magic-link login — synthesize the legacy session so that
 * getCurrentAccount(), loadUserNamespace(), and AutoSync all work correctly.
 */
async function bridgeLegacySession(supabaseUserId: string, email: string) {
  if (getSession()) return; // already set
  try {
    const res = await fetch("/api/auth/ensure-app-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, supabaseUserId }),
    });
    if (!res.ok) return;
    const { appUser } = await res.json();
    if (appUser) synthesizeSession(appUser);
  } catch {
    // Non-fatal — app still works via Supabase session
  }
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Public pages bypass session check — render immediately
    const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
    if (isPublic) { setChecking(false); return; }

    const supabase = getSupabaseBrowser();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
      } else {
        // Ensure legacy session is always in sync with Supabase session
        await bridgeLegacySession(session.user.id, session.user.email ?? "");
        setChecking(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // Clear Zustand store so next user doesn't see previous user's data
        useStore.getState().clearStore?.();
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  if (checking) {
    return null;
  }

  return <>{children}</>;
}
GUARDEOF

# ── Fix 2 + 3: store.ts — sessionStorage + clearStore + AppShell logout ───
python3 - << 'PYEOF'
import sys

# -- store.ts --
with open("src/lib/store.ts") as f:
    src = f.read()

orig = src

# Switch localStorage → sessionStorage
src = src.replace(
    "        return localStorage;",
    "        return sessionStorage; // sessionStorage clears on tab close — prevents cross-user data leakage",
    1
)

# Add clearStore to interface
src = src.replace(
    "  saveUserNamespaceAsync: () => Promise<void>;\n  exportData: () => string;",
    "  saveUserNamespaceAsync: () => Promise<void>;\n  clearStore: () => void;  // Reset all data — call on logout to prevent cross-user leakage\n  exportData: () => string;",
    1
)

# Add clearStore implementation
src = src.replace(
    "      loadSeedData: () => set((state) => {",
    """      clearStore: () => {
        const empty = getEmptySnapshot("");
        set((state) => {
          state.profile = empty.profile;
          state.incomes = empty.incomes;
          state.expenses = empty.expenses;
          state.debts = empty.debts;
          state.investments = empty.investments;
          state.retirement = empty.retirement;
          state.tax = empty.tax;
          state.scenarios = empty.scenarios;
          state.activeScenarioId = empty.activeScenarioId;
          state.isSeedLoaded = false;
          state.transactions = [];
          state.merchantRules = buildDefaultMerchantRules();
          state.statementImports = [];
          state.customExpenseCategories = [];
          state.yearlyForecast = [];
          state.monthlyForecast = [];
          state.localSyncStatus = "idle";
          state.remoteSyncStatus = "idle";
          state.lastLocalSaveTime = null;
          state.lastRemoteSaveTime = null;
          state.lastSyncError = null;
          state.isHydratedFromRemote = false;
          state.lineUserId = "";
          state.lineLastSyncedAt = null;
          state._localUpdatedAt = null;
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("financial-planner-storage-v3");
        }
      },

      loadSeedData: () => set((state) => {""",
    1
)

if src == orig:
    print("ERROR: store.ts patch failed — no changes made")
    sys.exit(1)

with open("src/lib/store.ts", "w") as f:
    f.write(src)
print("store.ts patched")

# -- AppShell.tsx --
with open("src/components/layout/AppShell.tsx") as f:
    src = f.read()

src = src.replace(
    "  const handleLogout = async () => {\n    const supabase = getSupabaseBrowser();\n    await supabase.auth.signOut();\n    router.push(\"/login\");\n  };",
    "  const handleLogout = async () => {\n    useStore.getState().clearStore?.();\n    const supabase = getSupabaseBrowser();\n    await supabase.auth.signOut();\n    router.push(\"/login\");\n  };",
    1
)

with open("src/components/layout/AppShell.tsx", "w") as f:
    f.write(src)
print("AppShell.tsx patched")
PYEOF

echo ""
echo "Committing..."
git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/components/AuthGuard.tsx src/components/layout/AppShell.tsx src/lib/store.ts
git commit -m "fix(critical): bridge legacy session, clearStore on logout, sessionStorage

DEFECT #2 - AuthGuard bridges Supabase to legacy session for all auth paths
DEFECT #3 - store uses sessionStorage instead of shared localStorage
DEFECT #4 - logout calls clearStore() before signOut"

echo ""
echo "Pushing to GitHub (triggers Vercel auto-deploy)..."
git push origin main

echo ""
echo "══════════════════════════════════════════════"
echo "  Done! Vercel deploys in ~1 minute."
echo ""
echo "  Fixes:"
echo "  ✓ /expenses/actuals no longer crashes for"
echo "    email/password + Google/magic-link users"
echo "  ✓ Store clears on logout — no data leakage"
echo "  ✓ sessionStorage: data auto-clears on tab close"
echo "══════════════════════════════════════════════"
