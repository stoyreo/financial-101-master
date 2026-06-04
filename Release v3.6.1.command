#!/bin/bash
set -e
echo "  Financial 101 — Release v3.6.1"
REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys

# ensure-app-user fix
route = open("src/app/api/auth/ensure-app-user/route.ts").read()
if "getSupabaseAdmin" not in route:
    print("ERROR: ensure-app-user not yet patched — run 'Fix ensure-app-user + Data Recovery.command' first")
    sys.exit(1)
print("✓ ensure-app-user already patched")

# version bump
with open("src/lib/version.ts") as f:
    src = f.read()

if "3.6.1" in src:
    print("✓ already v3.6.1")
else:
    src = src.replace('export const APP_VERSION = "3.6.0";', 'export const APP_VERSION = "3.6.1";')
    new_entry = '''  {
    version: "3.6.1",
    date: "2026-05-30",
    changes: [
      "Fixed critical auth bridge failure: ensure-app-user now uses admin client with email fallback",
      "Restored data for all existing accounts including toy.theeranan@icloud.com",
      "Fixed /expenses/actuals redirecting to main page after login",
      "Sync status bar restored",
    ],
  },
  '''
    src = src.replace('  {\n    version: "3.6.0",', new_entry + '  {\n    version: "3.6.0",', 1)
    with open("src/lib/version.ts", "w") as f:
        f.write(src)
    print("✓ version.ts bumped to v3.6.1")
PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/lib/version.ts
if git diff --cached --quiet; then
  echo "Nothing to commit — already up to date"
else
  git commit -m "release: v3.6.1 — hotfix ensure-app-user + data recovery"
  git push origin main
  echo "✓ Pushed. Vercel deploys in ~1 min."
fi
echo "Done."
