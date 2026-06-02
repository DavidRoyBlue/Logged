create table oauth_states (
  state text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  provider connection_provider not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create table auth_handoffs (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies => only the service role (which bypasses RLS) can touch these.
alter table oauth_states enable row level security;
alter table auth_handoffs enable row level security;
