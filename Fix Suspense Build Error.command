#!/bin/bash
# Hotfix: repair broken Suspense wrappers on login and actuals pages
# Build was failing with: "export default function import { ... }() {"

set -e
echo "══════════════════════════════════════════════"
echo "  Financial 101 — Fix Suspense Build Error"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
echo "Cloning repo..."
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys

fixes = [
    {
        "path": "src/app/login/page.tsx",
        "bad_export": 'export default function import { useState, useEffect, Suspense } from "react";() {',
        "bad_inner":  '<import { useState, useEffect, Suspense } from "react";Inner />',
        "component":  "LoginPage",
        "inner":      "LoginPageInner",
    },
    {
        "path": "src/app/expenses/actuals/page.tsx",
        "bad_export": 'export default function import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";() {',
        "bad_inner":  '<import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";Inner />',
        "component":  "ActualsPage",
        "inner":      "ActualsPageInner",
    },
]

for fix in fixes:
    with open(fix["path"]) as f:
        src = f.read()

    # Check if already broken
    if fix["bad_export"] not in src:
        print(f"✓ {fix['path']} already clean — skipping")
        continue

    name = fix["component"]
    inner = fix["inner"]

    # Repair broken export default
    src = src.replace(fix["bad_export"], f"export default function {name}() {{")

    # Repair broken inner component reference
    src = src.replace(fix["bad_inner"], f"<{inner} />")

    # Ensure the inner function rename happened
    if f"function {inner}()" not in src:
        src = src.replace(f"function {name}()", f"function {inner}()", 1)

    with open(fix["path"], "w") as f:
        f.write(src)

    # Quick sanity check
    if f"export default function {name}()" not in src:
        print(f"ERROR: {fix['path']} repair failed")
        sys.exit(1)
    if f"function {inner}()" not in src:
        print(f"ERROR: {fix['path']} inner function missing")
        sys.exit(1)

    print(f"✓ {fix['path']} repaired")

PYEOF

echo ""
echo "Committing..."
git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/login/page.tsx src/app/expenses/actuals/page.tsx
git diff --cached --stat

# Only commit if there are changes
if git diff --cached --quiet; then
  echo "Files already clean — nothing to commit."
else
  git commit -m "fix(build): repair Suspense wrapper syntax on login and actuals pages

Previous deploy script had a variable swap bug that produced:
  export default function import { ... } from 'react';() { }
Fixed: LoginPage / ActualsPage wrap LoginPageInner / ActualsPageInner."
  echo ""
  echo "Pushing to GitHub..."
  git push origin main
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  Done! Vercel will rebuild cleanly."
echo "══════════════════════════════════════════════"
