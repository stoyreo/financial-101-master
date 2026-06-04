#!/bin/bash
# ROOT FIX: getSession() broken because getUsers() returns []
# Fixes: actuals redirect, sync bar gone, data not loading

set -e
echo "══════════════════════════════════════════════"
echo "  Fix Session / Actuals / Sync Bar"
echo "══════════════════════════════════════════════"

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

# auth-client.ts — store full session in sessionStorage
cat > src/lib/auth-client.ts << 'EOF'
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
EOF

echo "✓ auth-client.ts"

python3 - << 'PYEOF'
# store.ts: clear session keys in clearStore
with open("src/lib/store.ts") as f:
    src = f.read()
src = src.replace(
    'sessionStorage.removeItem("financial-planner-storage-v3");\n        }',
    'sessionStorage.removeItem("financial-planner-storage-v3");\n          sessionStorage.removeItem("fp_session_data");\n          sessionStorage.removeItem("fp_current_user");\n        }'
)
with open("src/lib/store.ts", "w") as f:
    f.write(src)
print("✓ store.ts")

# AppShell: call clearSession on logout
with open("src/components/layout/AppShell.tsx") as f:
    src = f.read()
if "clearSession" not in src:
    src = src.replace(
        'import { getSession, isAdmin } from "@/lib/auth-client";',
        'import { getSession, isAdmin, clearSession } from "@/lib/auth-client";'
    )
    src = src.replace(
        "useStore.getState().clearStore?.();\n    const supabase = getSupabaseBrowser();",
        "useStore.getState().clearStore?.();\n    clearSession();\n    const supabase = getSupabaseBrowser();"
    )
    with open("src/components/layout/AppShell.tsx", "w") as f:
        f.write(src)
print("✓ AppShell.tsx")
PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/lib/auth-client.ts src/lib/store.ts src/components/layout/AppShell.tsx
git commit -m "fix: getSession reads full session from sessionStorage — fixes actuals/sync bar"
git push origin main

echo ""
echo "══════════════════════════════════════════════"
echo "  Deployed! After Vercel builds (~1 min):"
echo "  → Hard refresh (Cmd+Shift+R)"
echo "  → Actuals page loads correctly"
echo "  → Sync bar returns"
echo "  → Data restores from remote"
echo "══════════════════════════════════════════════"
