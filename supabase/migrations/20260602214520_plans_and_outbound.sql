create type plan_status as enum ('pending', 'completed', 'missed');
create type outbound_action as enum ('completed_plan', 'logged_new');
create type outbound_status as enum ('pending', 'ok', 'failed');

create table planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  planned_date date not null,
  target_distance_m double precision,
  title text not null,
  description text,
  status plan_status not null default 'pending',
  matched_activity_id uuid references activities (id) on delete set null,
  calendar_event_id text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planned_sessions_match_idx on planned_sessions (user_id, status, planned_date);

create table outbound_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  connection_id uuid not null references connections (id) on delete cascade,
  external_ref text,
  action outbound_action not null,
  status outbound_status not null default 'pending',
  retry_count integer not null default 0,
  error text,
  synced_at timestamptz,
  deleted_at timestamptz,
  unique (activity_id, connection_id)
);

alter table planned_sessions enable row level security;
alter table outbound_records enable row level security;
create policy "plans_select_own" on planned_sessions for select using (auth.uid() = user_id);
create policy "plans_write_own" on planned_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "outbound_select_own" on outbound_records for select using (auth.uid() = user_id);