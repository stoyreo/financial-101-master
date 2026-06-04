#!/bin/bash
# Fix: /expenses/actuals redirects to main page after login
# Root cause: login page ignored ?redirectTo= param, always sent users to /

set -e
echo "═══════════════════════════════════════════"
echo "  Financial 101 — Fix login redirect"
echo "═══════════════════════════════════════════"
echo ""

REPO_DIR=$(mktemp -d)
echo "Cloning repo..."
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

echo "Applying fix to src/app/login/page.tsx..."
python3 - << 'PYEOF'
import sys

with open("src/app/login/page.tsx") as f:
    src = f.read()

original = src

# Fix 1: already-authenticated redirect
src = src.replace(
    'router.replace("/");',
    'router.replace(searchParams.get("redirectTo") || "/");',
    1
)

# Fix 2: Google OAuth redirect
src = src.replace(
    'redirectTo: `${window.location.origin}/auth/callback?next=/`,',
    'redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(searchParams.get("redirectTo") || "/")}`,',
    1
)

# Fix 3: magic link redirect
src = src.replace(
    'emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,',
    'emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(searchParams.get("redirectTo") || "/")}`,',
    1
)

# Fix 4: password sign-in redirect
src = src.replace(
    'router.push("/");',
    'router.push(searchParams.get("redirectTo") || "/");',
    1
)

if src == original:
    print("ERROR: No changes made — login page may have already been patched or structure changed.")
    sys.exit(1)

with open("src/app/login/page.tsx", "w") as f:
    f.write(src)

print("login/page.tsx patched successfully.")
PYEOF

echo ""
echo "Committing..."
git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/login/page.tsx
git commit -m "fix(login): redirect to original destination after login

When middleware redirects unauthenticated users to /login, it sets
?redirectTo=<path>. The login page was ignoring this param and always
sending users to / after successful sign-in.

Fix: read redirectTo from searchParams in all four auth paths:
- Already-authenticated check (router.replace)
- Password sign-in (router.push)
- Google OAuth (redirectTo in Supabase signInWithOAuth)
- Magic link (emailRedirectTo in signInWithOtp)"

echo ""
echo "Pushing to GitHub (triggers Vercel auto-deploy)..."
git push origin main

echo ""
echo "═══════════════════════════════════════════"
echo "  Done! Vercel will deploy in ~1 minute."
echo "  Test: visit /expenses/actuals while"
echo "  logged out — should land there after login."
echo "═══════════════════════════════════════════"
