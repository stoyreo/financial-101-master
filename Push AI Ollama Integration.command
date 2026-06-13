#!/bin/bash
# Double-click to push the Ollama Gemma 4 AI integration to GitHub.
# Repo: github.com/stoyreo/financial-101-master  (origin/main)

cd "$(dirname "$0")" || exit 1

echo "=============================================="
echo " Pushing AI (Ollama Gemma 4) integration"
echo " Repo: $(git remote get-url origin 2>/dev/null)"
echo "=============================================="
echo

echo "Current commit:"
git log --oneline -1
echo

echo "Ahead/behind origin/main (left=origin, right=local):"
git rev-list --left-right --count origin/main...HEAD 2>/dev/null
echo

echo "Pushing to origin main..."
if git push origin main; then
  echo
  echo "✅ Push succeeded."
else
  echo
  echo "❌ Push failed (see message above)."
  echo "   If it's an auth error, sign in to GitHub when prompted, or run:"
  echo "   gh auth login"
fi

echo
echo "Press Return to close this window."
read -r _
