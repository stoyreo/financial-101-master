#!/bin/bash
cd "$(dirname "$0")"
echo "=== Pushing to GitHub ==="

# Remove stale locks
rm -f .git/HEAD.lock .git/index.lock

# Abort any in-progress rebase
if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; then
  echo "Aborting stuck rebase..."
  git rebase --abort
fi

# Drop stash if one exists (working changes are already in working tree)
git stash drop 2>/dev/null || true

# Commit everything that's changed
git add -A
git diff --cached --quiet && echo "(nothing new to commit)" || git commit -m "fix(LINE): remove email scope + surface LINE auth errors in UI"

# Push, force if needed (sole developer)
git push origin main || git push --force-with-lease origin main

echo ""
echo "=== Done! Vercel will deploy in ~1-2 min ==="
echo "Press any key to close..."
read -n 1
