#!/bin/bash
# Copies ALL production env vars from financial-planner → financial-101-master
# Run once from ~/Desktop/Claude Migration
set -e

cd "$(dirname "$0")"

DEST_PROJECT="financial-101-master"
DEST_TEAM="stoyreo"

echo ">>> Pulling production env vars from financial-planner..."
# Link to the source project temporarily
vercel link --yes --project financial-planner --scope stoyreo 2>/dev/null || true
vercel env pull .env.migrate --environment=production --yes 2>/dev/null || \
  vercel env pull .env.migrate --yes

echo ""
echo ">>> Env vars pulled to .env.migrate:"
cat .env.migrate | grep -v "^#" | grep "=" | sed 's/=.*/=***/' | head -30

echo ""
echo ">>> Linking to financial-101-master..."
vercel link --yes --project financial-101-master --scope stoyreo

echo ""
echo ">>> Pushing each env var to financial-101-master (production + preview + development)..."
while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue

  KEY="${line%%=*}"
  VALUE="${line#*=}"
  # Strip surrounding quotes if present
  VALUE="${VALUE%\"}"
  VALUE="${VALUE#\"}"
  VALUE="${VALUE%\'}"
  VALUE="${VALUE#\'}"

  if [[ -n "$KEY" && -n "$VALUE" ]]; then
    echo "  Adding $KEY ..."
    printf '%s' "$VALUE" | vercel env add "$KEY" production --force 2>/dev/null || true
    printf '%s' "$VALUE" | vercel env add "$KEY" preview --force 2>/dev/null || true
    printf '%s' "$VALUE" | vercel env add "$KEY" development --force 2>/dev/null || true
  fi
done < .env.migrate

rm -f .env.migrate
echo ""
echo ">>> Done! Triggering redeploy of financial-101-master..."
vercel deploy --prod
echo ""
echo ">>> All done! financial101.vercel.app should now have all env vars."
