create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strava_activity_id bigint not null,
  type text not null,
  start_time timestamptz not null,
  timezone text not null,
  distance_m double precision not null,
  moving_time_s integer not null,
  elapsed_time_s integer not null,
  avg_pace_s_per_km double precision,
  avg_hr double precision,
  max_hr double precision,
  elevation_gain_m double precision,
  calories double precision,
  name text,
  workout_type integer,
  zone_distribution jsonb,
  raw jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, strava_activity_id)
);

create index activities_user_start_idx on activities (user_id, start_time desc);
create index activities_user_workout_idx on activities (user_id, workout_type) where workout_type is not null;

alter table activities enable row level security;
create policy "activities_select_own" on activities
  for select using (auth.uid() = user_id and deleted_at is null);
