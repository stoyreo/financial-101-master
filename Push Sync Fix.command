#!/bin/bash
# Push the sync hydration + /api/sync auth fix to main (triggers Vercel deploy)
set -e

# Resolve to this script's own directory (the repo root)
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════════"
echo "  Financial 101 — Push Sync Fix"
echo "═══════════════════════════════════════════════════════════════"
echo "Repo: $(pwd)"
echo ""

# Clear any stale git locks left behind by a crashed process
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

echo "→ Staging changed files..."
git add src/components/AuthGuard.tsx src/app/api/sync/route.ts

echo "→ Committing..."
git commit -m "fix(sync): call loadUserNamespace on auth + supabase_user_id fallback in /api/sync

- AuthGuard hydrates from remote once session is confirmed, setting
  isHydratedFromRemote=true so remote saves are no longer skipped
- /api/sync resolves users by supabase_user_id when email lookup misses
  (gmail auth vs icloud app_users row mismatch) instead of 401" \
  || echo "(nothing to commit — already committed)"

echo "→ Pulling remote changes (rebase)..."
git pull --rebase origin main

echo "→ Pushing to origin/main..."
git push origin main

echo ""
echo "✅ Pushed. Vercel will auto-deploy."
echo "   When the deploy finishes, hard-refresh the live app (Cmd+Shift+R)."
echo "   Expect the sync bar to show 'Remote: completed' then 'idle'."
echo ""
echo "Press Return to close this window."
read
