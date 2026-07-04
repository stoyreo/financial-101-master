#!/bin/bash
# Sets CRON_SECRET on Vercel for the watchlist-alerts daily cron.
# Vercel automatically sends "Authorization: Bearer $CRON_SECRET" with each
# cron invocation; /api/cron/watchlist-alerts rejects anything else.
set -e
cd "$(dirname "$0")"

SECRET="21cf5bc0f38c0d6b6c3c4e8042aa13d4dab7948555ba6c77086025ca67362d9c"

echo ">>> Linking to financial-101-master..."
vercel link --yes --project financial-101-master --scope stoyreo

echo ">>> Setting CRON_SECRET (production)..."
# Remove first in case it already exists, then add.
vercel env rm CRON_SECRET production --yes 2>/dev/null || true
printf '%s' "$SECRET" | vercel env add CRON_SECRET production

echo ">>> Setting CRON_SECRET (preview)..."
vercel env rm CRON_SECRET preview --yes 2>/dev/null || true
printf '%s' "$SECRET" | vercel env add CRON_SECRET preview

# Keep local dev in sync so you can test the cron route locally:
#   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/watchlist-alerts
if ! grep -q "^CRON_SECRET=" .env.local 2>/dev/null; then
  printf '\nCRON_SECRET=%s\n' "$SECRET" >> .env.local
  echo ">>> Appended CRON_SECRET to .env.local"
else
  echo ">>> .env.local already has CRON_SECRET — left unchanged"
fi

echo ""
echo "✅ Done. Redeploy so the cron picks it up (e.g. run push.command or vercel --prod)."
read -p "Press Enter to close..."
