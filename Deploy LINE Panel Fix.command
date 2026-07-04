#!/bin/bash
# Commits ONLY the LINE Messaging API panel fix (2 files) and pushes to
# origin/main, which triggers a Vercel production deploy.
# It deliberately does NOT touch your other work-in-progress changes.
set -e
cd "$(dirname "$0")"

# Clear any stale git lock left by an interrupted process (safe when no
# real git process is running).
if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  echo ">>> Removed stale .git/index.lock"
fi

echo ">>> Staging LINE panel fix (profile page + env example only)..."
git add src/app/profile/page.tsx .env.local.example

echo ">>> Committing..."
git commit -m "fix(LINE): replace discontinued LINE Notify panel with Messaging API panel" \
  || echo "(nothing to commit -- may already be committed)"

echo ">>> Pushing to origin/main (Vercel will auto-deploy)..."
git push origin main

echo ""
echo "Done. Vercel will build & deploy in ~1-2 min."
echo "Your other in-progress files were left untouched:"
git status --short
read -p "Press Enter to close..."
