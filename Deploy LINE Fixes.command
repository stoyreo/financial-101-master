#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "══════════════════════════════════════════════"
echo "  Deploy: LINE Integration Bug Fixes"
echo "══════════════════════════════════════════════"
echo ""

git add \
  src/app/auth/line/callback/page.tsx \
  src/lib/auth.ts \
  src/lib/store.ts \
  src/app/api/line/fetch-transactions/route.ts

git commit -m "fix: LINE integration — login loop, persistence, category trust, isolation

- src/app/auth/line/callback/page.tsx: use window.location.href instead of
  router.replace so middleware sees fp_session_exists cookie (fixes silent
  redirect loop back to /login after LINE OAuth)
- src/lib/store.ts: add lineUserId + lineLastSyncedAt to partialize so UID
  survives page refresh; skip merchant-rule overrides for LINE source
  transactions so trusted LINE categories are preserved
- src/lib/auth.ts: reset lineUserId + lineLastSyncedAt in both synthesizeSession
  and clearSession to prevent UID leaking between users
- src/app/api/line/fetch-transactions/route.ts: fix currency field tautology"

echo ""
echo "Pushing to origin/main..."
git push origin main

echo ""
echo "✓ Done — Vercel will build and deploy automatically."
echo ""
echo "After deploy (~1 min), go to /expenses/actuals and:"
echo "  1. Click 'Sync from LINE' button (top-right, next to Import Statement)"
echo "  2. Enter your LINE UID (starts with U...)"
echo "  3. Click 'Sync Now'"
echo ""
read -p "Press Enter to close..."
