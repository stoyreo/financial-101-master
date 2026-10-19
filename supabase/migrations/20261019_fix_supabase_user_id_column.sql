-- Fix: app code (ensure-app-user, server-auth, auth.ts) has always used the
-- column name `supabase_user_id`, but the only migration ever committed for
-- this (AUTH_FIX.sql) created it as `auth_user_id` instead. That mismatch is
-- the direct cause of the production error:
--   "Could not find the 'supabase_user_id' column of 'app_users' in the
--    schema cache"
--
-- This migration is safe to run regardless of whether AUTH_FIX.sql was ever
-- actually applied:
--   - If `auth_user_id` exists and `supabase_user_id` doesn't, it renames
--     the column in place (keeps all existing links, no data loss).
--   - If neither exists yet, it creates `supabase_user_id` fresh.
--   - If `supabase_user_id` already exists, it's a no-op.
-- Run this once in the Supabase SQL Editor for the Financial 101 project
-- (https://qmuvdpnnpptfrinhnzlv.supabase.co).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'auth_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'supabase_user_id'
  ) then
    alter table public.app_users rename column auth_user_id to supabase_user_id;
  end if;
end $$;

alter table public.app_users
  add column if not exists supabase_user_id uuid references auth.users(id) on delete set null;

-- Drop the old index name if AUTH_FIX.sql's index survived the rename under
-- its old name, then (re)create it under the name the app expects.
drop index if exists idx_app_users_auth_user_id;
create index if not exists idx_app_users_supabase_user_id on public.app_users(supabase_user_id);

-- Force PostgREST to pick up the schema change immediately rather than
-- waiting for its next automatic cache refresh — this alone can be the fix
-- if the column already existed correctly but the API was still erroring.
notify pgrst, 'reload schema';

-- Verify
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_users'
  and column_name = 'supabase_user_id';
