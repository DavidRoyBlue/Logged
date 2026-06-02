create type backfill_status as enum ('none', 'running', 'done');
create type backfill_window as enum ('90d', 'full');
create type user_tier as enum ('free', 'pro');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  tier user_tier not null default 'free',
  backfill_status backfill_status not null default 'none',
  backfill_window backfill_window not null default '90d',
  backfill_cursor timestamptz,
  backfill_updated_at timestamptz,
  athlete_zones jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
