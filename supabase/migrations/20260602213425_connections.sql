create type connection_provider as enum ('strava', 'google_calendar', 'notion');
create type connection_status as enum ('pending_config', 'active', 'expired', 'revoked');

create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider connection_provider not null,
  external_account_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  status connection_status not null default 'pending_config',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index connections_user_idx on connections (user_id);

alter table connections enable row level security;
create policy "connections_select_own" on connections for select using (auth.uid() = user_id);
