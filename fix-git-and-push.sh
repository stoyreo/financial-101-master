#!/bin/bash
# Fix git lock + wrong remote, then commit & push the account-isolation fixes.
set -e

cd "$(dirname "$0")"

echo ">>> Removing stale lock files..."
rm -f .git/index.lock .git/HEAD.lock .git/config.lock .git/COMMIT_EDITMSG.lock

echo ">>> Fixing remote URL (financial-planner → financial-101-master)..."
git remote set-url origin https://github.com/stoyreo/financial-101-master.git
git remote -v

echo ">>> Committing account-isolation fixes..."
git add src/app/expenses/actuals/page.tsx src/lib/store.ts
git commit -m "fix: scope actuals page to active account, prevent cross-account data leak

- Filter transactions/statementImports by accountId at component level
- Tag StatementImport records with accountId on import (was missing)
- Fix clearMonthTransactions to scope deletes by accountId
  (previously wiped all accounts' data for a billing month)
- Remove duplicate getCurrentAccount() call inside handleFile"

echo ">>> Pushing to financial-101-master main..."
git push origin main

echo ">>> Done! Vercel will auto-deploy in ~1-2 min."
