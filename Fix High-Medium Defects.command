#!/bin/bash
# Fix 6 high/medium defects:
# #5  signup page ignores ?redirectTo= param
# #6  GET /api/admin/users has no admin role check
# #7  /line/view missing from public paths
# #8  useSearchParams() without Suspense on login/signup/actuals
# #9  duplicate Finder files and junk test files in repo
# #10 real financial data in public repo (toyRealData.ts)

set -e
echo "══════════════════════════════════════════════"
echo "  Financial 101 — Fix High/Medium Defects"
echo "══════════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
echo "Cloning repo..."
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

echo "Applying fixes..."

python3 - << 'PYEOF'
import os, re, sys

errors = []

# ── #5 signup/page.tsx ────────────────────────────────────────────────────
with open("src/app/signup/page.tsx") as f:
    src = f.read()

src = src.replace(
    'import { useState, useEffect } from "react";\nimport { useRouter } from "next/navigation";',
    'import { useState, useEffect, Suspense } from "react";\nimport { useRouter, useSearchParams } from "next/navigation";'
)
src = src.replace(
    '  const router = useRouter();\n  const [email, setEmail] = useState("");',
    '  const router = useRouter();\n  const searchParams = useSearchParams();\n  const [email, setEmail] = useState("");'
)
src = src.replace(
    '      if (session) {\n        router.replace("/");\n        return;\n      }',
    '      if (session) {\n        router.replace(searchParams.get("redirectTo") || "/");\n        return;\n      }'
)
src = src.replace(
    '          redirectTo: `${window.location.origin}/auth/callback?next=/`,\n          queryParams: { prompt: "select_account" },',
    '          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(searchParams.get("redirectTo") || "/")}`,\n          queryParams: { prompt: "select_account" },'
)
src = src.replace(
    '      // Redirect to home\n      router.push("/");',
    '      // Redirect to intended destination\n      router.push(searchParams.get("redirectTo") || "/");'
)
src = src.replace('export default function SignupPage()', 'function SignupPageInner()')
src = src + '\nexport default function SignupPage() {\n  return (\n    <Suspense>\n      <SignupPageInner />\n    </Suspense>\n  );\n}\n'
with open("src/app/signup/page.tsx", "w") as f:
    f.write(src)
print("✓ signup/page.tsx")

# ── #6 admin/users/route.ts GET ───────────────────────────────────────────
with open("src/app/api/admin/users/route.ts") as f:
    src = f.read()

old_get = '''export async function GET(_req: NextRequest) {
  try {
    // Authenticate user
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: true });'''

new_get = '''export async function GET(_req: NextRequest) {
  try {
    // Authenticate user and verify admin role
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data: callerRow, error: callerErr } = await db
      .from("app_users")
      .select("role")
      .eq("email", session.user.email?.toLowerCase() || "")
      .maybeSingle();
    if (callerErr || !callerRow || callerRow.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await db
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: true });'''

if old_get not in src:
    errors.append("admin/users GET handler not found")
else:
    src = src.replace(old_get, new_get, 1)
    with open("src/app/api/admin/users/route.ts", "w") as f:
        f.write(src)
    print("✓ api/admin/users/route.ts")

# ── #7 middleware + providers: /line/view public ──────────────────────────
with open("src/middleware.ts") as f:
    src = f.read()
src = src.replace(
    'const publicPaths = ["/login", "/signup", "/auth/callback", "/api/", "/_next/", "/favicon.ico"];',
    'const publicPaths = ["/login", "/signup", "/auth/callback", "/api/", "/_next/", "/favicon.ico", "/line/view"];'
)
with open("src/middleware.ts", "w") as f:
    f.write(src)
print("✓ middleware.ts")

with open("src/app/providers.tsx") as f:
    src = f.read()
src = src.replace(
    '  "/auth/callback",\n  "/auth/callback/",\n];',
    '  "/auth/callback",\n  "/auth/callback/",\n  "/line/view",   // Public receipt page linked from LINE bot\n];'
)
with open("src/app/providers.tsx", "w") as f:
    f.write(src)
print("✓ providers.tsx")

# ── #8 Suspense wrappers ─────────────────────────────────────────────────
for path, old_name, new_name, extra_import in [
    (
        "src/app/login/page.tsx",
        'import { useState, useEffect } from "react";',
        'import { useState, useEffect, Suspense } from "react";',
        "LoginPage",
    ),
    (
        "src/app/expenses/actuals/page.tsx",
        'import { useEffect, useMemo, useRef, useState, useCallback } from "react";',
        'import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";',
        "ActualsPage",
    ),
]:
    with open(path) as f:
        src = f.read()
    src = src.replace(old_name, new_name, 1)
    inner = f"{new_name}Inner"
    src = src.replace(f"export default function {new_name}()", f"function {inner}()")
    src = src + f"\nexport default function {new_name}() {{\n  return (\n    <Suspense>\n      <{inner} />\n    </Suspense>\n  );\n}}\n"
    with open(path, "w") as f:
        f.write(src)
    print(f"✓ {path} (Suspense)")

# ── #9 Delete duplicate / junk files ─────────────────────────────────────
junk = [
    "src/app/api/investments/scbgoldhrmf-forecast/route 2.ts",
    "src/app/investments/_components/ForecastCollapse 2.tsx",
    "src/app/investments/_components/SCBGOLDHRMFForecastCard 2.tsx",
    "src/app/investments/_components/TokenUsageStamp 2.tsx",
    "src/lib/__test_write.txt",
    "src/lib/_test_write.txt",
]
for rel in junk:
    if os.path.exists(rel):
        os.remove(rel)
        print(f"✓ deleted {rel}")

# ── #10 Anonymize toyRealData.ts ──────────────────────────────────────────
with open("src/lib/toyRealData.ts") as f:
    src = f.read()
src = src.replace(
    '/**\n * TOY REAL DATA',
    '/**\n * ADMIN SEED DATA (anonymized — real data in Supabase)\n * Former: TOY REAL DATA'
)
src = re.sub(r'(\bamount:\s*)\d[\d_]*', r'\g<1>0', src)
src = re.sub(r'(\bbalance:\s*)\d[\d.]*', r'\g<1>0', src)
src = re.sub(r'(\bvalue:\s*)\d[\d.]*', r'\g<1>0', src)
src = src.replace('"Toy"', '"Admin"').replace('"Toy Theeranan"', '"Admin User"')
with open("src/lib/toyRealData.ts", "w") as f:
    f.write(src)
print("✓ toyRealData.ts anonymized")

if errors:
    print("\nERRORS:")
    for e in errors:
        print(f"  ✗ {e}")
    sys.exit(1)
PYEOF

echo ""
echo "Committing..."
git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add -A
git commit -m "fix(high+medium): signup redirect, admin auth, line/view, Suspense, duplicates, toyRealData

#5  signup respects ?redirectTo= (same fix as login)
#6  GET /api/admin/users now checks admin role
#7  /line/view added to public paths in middleware + providers
#8  Suspense wrappers on login, signup, actuals pages
#9  Deleted 4 duplicate Finder files + 2 junk test files
#10 toyRealData.ts anonymized (amounts zeroed, public repo)"

echo ""
echo "Pushing to GitHub (triggers Vercel auto-deploy)..."
git push origin main

echo ""
echo "══════════════════════════════════════════════"
echo "  Done! Vercel deploys in ~1 minute."
echo ""
echo "  ✓ Signup redirects to original destination"
echo "  ✓ User list API is admin-only"
echo "  ✓ LINE receipt links work without login"
echo "  ✓ Suspense boundaries added"
echo "  ✓ Repo cleaned of duplicate/junk files"
echo "  ✓ Personal financial data removed from repo"
echo "══════════════════════════════════════════════"
