#!/bin/bash
# Hotfix: remove duplicate `export default` from login and actuals pages
# Error: "the name `default` is exported multiple times"

set -e
echo "══════════════════════════════════════════════"
echo "  Financial 101 — Fix Duplicate export default"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys

for path, inner in [
    ("src/app/login/page.tsx", "LoginPageInner"),
    ("src/app/expenses/actuals/page.tsx", "ActualsPageInner"),
]:
    with open(path) as f:
        src = f.read()

    fixed = src.replace(
        f"export default function {inner}()",
        f"function {inner}()",
        1
    )

    exports = [l for l in fixed.splitlines() if l.startswith("export default")]
    if len(exports) != 1:
        print(f"ERROR: {path} has {len(exports)} export defaults after fix: {exports}")
        sys.exit(1)

    with open(path, "w") as f:
        f.write(fixed)
    print(f"✓ {path} — 1 export default remaining")

PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/login/page.tsx src/app/expenses/actuals/page.tsx
git commit -m "fix(build): remove duplicate export default from LoginPageInner/ActualsPageInner

Each file had two export defaults — one on the inner function and one on
the Suspense wrapper. Stripped export default from the inner functions."
git push origin main

echo ""
echo "══════════════════════════════════════════════"
echo "  Pushed. Vercel will build cleanly now."
echo "══════════════════════════════════════════════"
