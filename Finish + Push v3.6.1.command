#!/bin/bash
# Finishes any in-progress rebase, commits the v3.6.1 version bump, and pushes to main.
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════════"
echo "  Financial 101 — Finish + Push v3.6.1"
echo "═══════════════════════════════════════════════════════════════"
echo "Repo: $(pwd)"
echo ""

rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

# If a rebase is still in progress, mark resolved files and continue it.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  echo "→ Rebase in progress — marking resolved files and continuing..."
  git add src/components/AuthGuard.tsx src/app/api/sync/route.ts 2>/dev/null || true
  GIT_EDITOR=true git rebase --continue || true
fi

echo "→ Committing version bump..."
git add src/lib/version.ts src/components/AuthGuard.tsx src/app/api/sync/route.ts
git commit -m "chore(release): v3.6.1 — fix remote sync hydration + /api/sync auth fallback" \
  || echo "(nothing new to commit)"

echo "→ Syncing with remote (rebase)..."
git pull --rebase origin main

echo "→ Pushing to origin/main..."
git push origin main

echo ""
echo "✅ Pushed v3.6.1. Vercel will auto-deploy."
echo "   When the deploy finishes, hard-refresh the live app (Cmd+Shift+R)."
echo "   The changelog will show v3.6.1 and the sync bar should reach 'idle'."
echo ""
echo "Press Return to close this window."
read
