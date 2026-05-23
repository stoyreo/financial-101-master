#!/bin/bash
cd ~/Desktop/Claude\ Migration

echo "==> Committing storageKey cookie fix..."
git commit -m "Fix sync 401 for LINE users: fp_storage_key cookie fallback

The generateLink/verifyOtp approach was unreliable with synthetic LINE
emails. Root cause: /api/sync authenticates via supabase.auth.getUser()
which requires Supabase auth cookies — never set by LINE login.

Fix (two parts):
1. synthesizeSession() now also sets fp_storage_key cookie (the user's
   storageKey) alongside fp_session_exists. Cleared on logout.
2. /api/sync getAuthenticatedUserStorageKey() now has two auth paths:
   Path A: Supabase session cookie (email/password, Google OAuth) — unchanged
   Path B: fp_storage_key cookie (LINE and other non-Supabase logins)
           Verifies key exists and is active in app_users before trusting it.

This mirrors the same pattern the middleware uses with fp_session_exists."

echo "==> Pushing to origin main..."
git push origin main

echo ""
echo "Done! Check above for any errors."
read -p "Press Enter to close..."
