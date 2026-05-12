-- WIPE SOMCHAI SEED DATA FROM SUPABASE
-- ====================================
-- Run these queries in the Supabase SQL editor to clean up corrupted user_data rows

-- 1. Identify which user_data rows still contain Somchai seed data
SELECT
  storage_key,
  data->'profile'->>'fullName' AS profile_name,
  jsonb_array_length(COALESCE(data->'incomes', '[]'::jsonb)) AS income_count,
  jsonb_array_length(COALESCE(data->'expenses', '[]'::jsonb)) AS expense_count,
  updated_at
FROM user_data
WHERE
  data->'profile'->>'fullName' = 'Somchai'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(data->'incomes', '[]'::jsonb)) inc
    WHERE inc->>'owner' = 'Somchai'
  );

-- 2. Inspect output above. For each polluted row, choose ONE:
--    (A) Delete the row entirely — user will start blank on next login.
--    (B) Restore from a Google Drive backup — open BackupWidget in the app
--        and pick a version dated before the corruption.

-- Option A — delete polluted rows (run only after manual review of step 1):
DELETE FROM user_data
WHERE
  data->'profile'->>'fullName' = 'Somchai'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(data->'incomes', '[]'::jsonb)) inc
    WHERE inc->>'owner' = 'Somchai'
  );

-- 3. Optional — also wipe storage_keys that should never have been seeded:
--    (run only if the user wants a hard reset of all non-admin data)
-- DELETE FROM user_data
-- WHERE storage_key NOT IN (
--   SELECT "storageKey" FROM app_users WHERE role = 'admin'
-- );

-- 4. Sanity check after deletion
SELECT COUNT(*) AS remaining_rows FROM user_data;
SELECT COUNT(*) AS rows_with_somchai
  FROM user_data WHERE data::text ILIKE '%Somchai%';
-- Both queries should return values consistent with what you expect.
-- The second one MUST return 0.
