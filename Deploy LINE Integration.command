#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "══════════════════════════════════════════════"
echo "  Deploy: LINE Integration + Login Fix"
echo "══════════════════════════════════════════════"
echo ""

git add \
  src/lib/types.ts \
  src/lib/store.ts \
  src/app/api/line/fetch-transactions/route.ts \
  src/app/expenses/actuals/page.tsx \
  src/app/auth/line/callback/page.tsx

git commit -m "feat: LINE Expense Tracker live sync + fix LINE login redirect loop

- src/lib/types.ts: add 'line' to Transaction.source union
- src/lib/store.ts: add lineUserId, lineLastSyncedAt state + setters
- src/app/api/line/fetch-transactions/route.ts: new proxy route, maps
  ExpenseOut->Transaction, dedupeKey='line-<id>', trusts LINE category
- src/app/expenses/actuals/page.tsx: Sync from LINE panel + UID input +
  last-synced badge + LINE pill on transaction rows
- src/app/auth/line/callback/page.tsx: fix post-login redirect loop,
  use window.location.href so middleware sees fp_session_exists cookie"

echo ""
echo "Pushing to origin/main..."
git push origin main

echo ""
echo "✓ Done — Vercel will build and deploy automatically."
echo ""
read -p "Press Enter to close..."
