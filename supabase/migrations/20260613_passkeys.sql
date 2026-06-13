-- Passkeys table for WebAuthn / Touch ID authentication
create table if not exists passkeys (
  id text primary key,                          -- credential ID (base64url)
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,                     -- base64url-encoded public key
  counter bigint not null default 0,
  device_type text,                             -- 'singleDevice' | 'multiDevice'
  backed_up boolean not null default false,
  transports text[],                            -- e.g. ['internal']
  created_at timestamptz not null default now()
);

create index if not exists passkeys_user_id_idx on passkeys(user_id);

-- RLS: users can only see/manage their own passkeys
alter table passkeys enable row level security;

create policy "passkeys: own rows only"
  on passkeys for all
  using (user_id = auth.uid());
