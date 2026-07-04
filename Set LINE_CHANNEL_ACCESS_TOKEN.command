#!/bin/bash
# Sets LINE_CHANNEL_ACCESS_TOKEN on Vercel for LINE Messaging API pushes
# (watchlist alerts + in-app LINE notifications).
#
# ONE-TIME SETUP in https://developers.line.biz/console (same provider as
# your existing LINE Login channel):
#   1. Create a "Messaging API" channel
#   2. Messaging API tab → issue a long-lived "Channel access token"
#   3. Scan the bot's QR code (same tab) and ADD IT AS A FRIEND — LINE
#      rejects pushes to users who haven't friended the bot
# Then run this script and paste the token when prompted.
set -e
cd "$(dirname "$0")"

echo ">>> Paste your Messaging API Channel access token:"
read -r -s TOKEN
if [ -z "$TOKEN" ]; then
  echo "No token entered — aborting."
  exit 1
fi

echo ">>> Linking to financial-101-master..."
vercel link --yes --project financial-101-master --scope stoyreo

for ENVIRONMENT in production preview; do
  echo ">>> Setting LINE_CHANNEL_ACCESS_TOKEN ($ENVIRONMENT)..."
  vercel env rm LINE_CHANNEL_ACCESS_TOKEN "$ENVIRONMENT" --yes 2>/dev/null || true
  printf '%s' "$TOKEN" | vercel env add LINE_CHANNEL_ACCESS_TOKEN "$ENVIRONMENT"
done

if ! grep -q "^LINE_CHANNEL_ACCESS_TOKEN=" .env.local 2>/dev/null; then
  printf '\nLINE_CHANNEL_ACCESS_TOKEN=%s\n' "$TOKEN" >> .env.local
  echo ">>> Appended LINE_CHANNEL_ACCESS_TOKEN to .env.local"
else
  echo ">>> .env.local already has LINE_CHANNEL_ACCESS_TOKEN — left unchanged"
fi

echo ""
echo "✅ Done. Redeploy (push.command or vercel --prod), sign in with LINE,"
echo "   then flip 'LINE alerts on' in the Short-Term Watchlist card."
read -p "Press Enter to close..."
