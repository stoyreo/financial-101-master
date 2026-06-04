#!/bin/bash
# Finish the in-progress rebase (conflicts already resolved) and push to main.
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════════"
echo "  Financial 101 — Continue Rebase + Push"
echo "═══════════════════════════════════════════════════════════════"
echo "Repo: $(pwd)"
echo ""

rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

echo "→ Marking resolved files..."
git add src/components/AuthGuard.tsx src/app/api/sync/route.ts

echo "→ Continuing rebase..."
# GIT_EDITOR=true auto-accepts the commit message without opening an editor
GIT_EDITOR=true git rebase --continue

echo "→ Pushing to origin/main..."
git push origin main

echo ""
echo "✅ Pushed. Vercel will auto-deploy."
echo "   When the deploy finishes, hard-refresh the live app (Cmd+Shift+R)."
echo "   Expect the sync bar to show 'Remote: completed' then 'idle'."
echo ""
echo "Press Return to close this window."
read
