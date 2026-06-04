#!/bin/bash
# Release v3.6.0
# - Auto-migrates localStorage data to sessionStorage (restores wiped data for toy.theeranan@icloud.com)
# - Fixes duplicate export default build errors on login + actuals pages
# - Bumps version to v3.6.0 with full changelog

set -e
echo "══════════════════════════════════════════════"
echo "  Financial 101 — Release v3.6.0"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys, re

errors = []

# ── Fix duplicate export default (login + actuals) ────────────────────────
for path, inner in [
    ("src/app/login/page.tsx", "LoginPageInner"),
    ("src/app/expenses/actuals/page.tsx", "ActualsPageInner"),
]:
    with open(path) as f:
        src = f.read()
    fixed = src.replace(f"export default function {inner}()", f"function {inner}()", 1)
    exports = [l for l in fixed.splitlines() if l.startswith("export default")]
    if len(exports) != 1:
        errors.append(f"{path}: {len(exports)} export defaults after fix")
    else:
        with open(path, "w") as f:
            f.write(fixed)
        print(f"✓ {path}")

# ── store.ts: auto-migrate localStorage → sessionStorage ─────────────────
with open("src/lib/store.ts") as f:
    src = f.read()

OLD = '''      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return {
          getItem: () => null, setItem: () => {}, removeItem: () => {},
        };
        return sessionStorage; // sessionStorage clears on tab close — prevents cross-user data leakage
      }),'''

NEW = '''      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return {
          getItem: () => null, setItem: () => {}, removeItem: () => {},
        };
        // One-time migration: if sessionStorage is empty but localStorage has data,
        // copy it over so existing users don\'t lose data after the localStorage→sessionStorage switch.
        const KEY = "financial-planner-storage-v3";
        if (!sessionStorage.getItem(KEY)) {
          const legacy = localStorage.getItem(KEY);
          if (legacy) {
            try { sessionStorage.setItem(KEY, legacy); } catch { /* quota */ }
          }
        }
        return sessionStorage; // sessionStorage clears on tab close — prevents cross-user data leakage
      }),'''

if OLD not in src:
    errors.append("store.ts: storage block not found (already migrated?)")
else:
    src = src.replace(OLD, NEW, 1)
    with open("src/lib/store.ts", "w") as f:
        f.write(src)
    print("✓ src/lib/store.ts (localStorage migration)")

# ── version.ts: bump to 3.6.0 ────────────────────────────────────────────
with open("src/lib/version.ts") as f:
    src = f.read()

src = src.replace('export const APP_VERSION = "3.5.0";', 'export const APP_VERSION = "3.6.0";')
src = src.replace('export const BUILD_DATE = "2026-05-26";', 'export const BUILD_DATE = "2026-05-30";')

NEW_ENTRY = '''  {
    version: "3.6.0",
    date: "2026-05-30",
    changes: [
      "Fixed /expenses/actuals crash for email/password and Google OAuth users",
      "All auth paths now bridge Supabase session — AutoSync and data loading work correctly",
      "Logout now clears the Zustand store to prevent cross-user data leakage",
      "Store switched from localStorage to sessionStorage with one-time data migration",
      "Signup page now respects ?redirectTo= param",
      "GET /api/admin/users now requires admin role",
      "LINE receipt links (/line/view) no longer require login",
      "Suspense boundaries added to login, signup, and actuals pages",
      "Removed duplicate Finder files and debug test files from repository",
      "Personal financial data removed from public repository",
    ],
  },
  '''

src = src.replace('  {\n    version: "3.5.0",', NEW_ENTRY + '  {\n    version: "3.5.0",', 1)

with open("src/lib/version.ts", "w") as f:
    f.write(src)
print("✓ src/lib/version.ts (v3.6.0)")

if errors:
    for e in errors: print(f"⚠ {e}")
    sys.exit(1)
PYEOF

echo ""
git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/login/page.tsx src/app/expenses/actuals/page.tsx src/lib/store.ts src/lib/version.ts
git commit -m "release: v3.6.0 — data recovery, build fix, security patches

- One-time migration: copies localStorage data to sessionStorage so
  existing users (e.g. toy.theeranan@icloud.com) don't lose their data
- Fixes duplicate export default build error on login + actuals pages
- Bumps version to v3.6.0 with full changelog of all fixes"

echo ""
echo "Pushing to GitHub..."
git push origin main

echo ""
echo "══════════════════════════════════════════════"
echo "  v3.6.0 deployed! Vercel builds in ~1 min."
echo ""
echo "  After deploy:"
echo "  → Reload financial101.vercel.app"
echo "  → Your data (toy.theeranan@icloud.com)"
echo "    will be automatically restored"
echo "══════════════════════════════════════════════"
