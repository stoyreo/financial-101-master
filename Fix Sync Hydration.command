#!/bin/bash
# Fix: Remote sync error + "Not yet hydrated from remote"
# Root cause: loadUserNamespace() was never called after login

set -e
echo "══════════════════════════════════════════════"
echo "  Fix Sync Hydration"
echo "══════════════════════════════════════════════"

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys

# AuthGuard: call loadUserNamespace after session bridge
with open("src/components/AuthGuard.tsx") as f:
    src = f.read()

if "loadUserNamespace" in src:
    print("✓ AuthGuard already patched")
else:
    if 'import { useStore }' not in src:
        src = src.replace(
            'import { getSession, synthesizeSession } from "@/lib/auth-client";',
            'import { getSession, synthesizeSession } from "@/lib/auth-client";\nimport { useStore } from "@/lib/store";'
        )
    src = src.replace(
        "        await bridgeLegacySession(session.user.id, session.user.email ?? \"\");\n        setChecking(false);",
        "        await bridgeLegacySession(session.user.id, session.user.email ?? \"\");\n        useStore.getState().loadUserNamespace().catch(() => {/* non-fatal */});\n        setChecking(false);"
    )
    with open("src/components/AuthGuard.tsx", "w") as f:
        f.write(src)
    print("✓ AuthGuard.tsx: loadUserNamespace() added")

# /api/sync: supabase_user_id fallback
with open("src/app/api/sync/route.ts") as f:
    src = f.read()

if "supabase_user_id" in src:
    print("✓ api/sync already has uid fallback")
else:
    old = '''      if (!userRows) {
        console.warn("[getAuthenticatedUserStorageKey] User not found in app_users:", supabaseUser.email);
        return { ok: false, error: "unauthorized: user not found in app registry" };
      }'''
    new = '''      if (!userRows) {
        const { data: byUid } = await adminDb
          .from("app_users").select("*")
          .eq("supabase_user_id", supabaseUser.id).maybeSingle();
        if (byUid) {
          const appUser = rowToAppUser(byUid as any);
          if (!appUser.isActive) return { ok: false, error: "unauthorized: inactive" };
          return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
        }
        return { ok: false, error: "unauthorized: user not found in app registry" };
      }'''
    src = src.replace(old, new, 1)
    with open("src/app/api/sync/route.ts", "w") as f:
        f.write(src)
    print("✓ api/sync/route.ts: uid fallback added")
PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/components/AuthGuard.tsx src/app/api/sync/route.ts
if git diff --cached --quiet; then
  echo "Already up to date."
else
  git commit -m "fix(sync): call loadUserNamespace in AuthGuard + api/sync uid fallback"
  git push origin main
  echo "✓ Pushed"
fi
echo ""
echo "After deploy + hard refresh (Cmd+Shift+R):"
echo "→ Sync bar shows 'Saved' instead of error"
echo "→ 'Not yet hydrated' message clears"
