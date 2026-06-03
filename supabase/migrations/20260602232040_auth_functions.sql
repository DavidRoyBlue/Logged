-- Auth SQL functions: oauth state, auth handoff, connection attach/activate
-- All SECURITY DEFINER with pinned search_path; service_role only.

-- =============================================================================
-- 1. create_oauth_state
-- =============================================================================
create or replace function public.create_oauth_state(
  p_provider connection_provider,
  p_user_id  uuid
) returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_state text;
begin
  v_state := encode(gen_random_bytes(18), 'hex');
  insert into public.oauth_states (state, user_id, provider)
  values (v_state, p_user_id, p_provider);
  return v_state;
end;
$$;

-- =============================================================================
-- 2. consume_oauth_state
-- =============================================================================
create or replace function public.consume_oauth_state(
  p_state text
) returns table(user_id uuid, provider connection_provider)
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_row public.oauth_states%rowtype;
begin
  delete from public.oauth_states
  where  state = p_state
    and  expires_at > now()
  returning *
  into v_row;

  if found then
    user_id  := v_row.user_id;
    provider := v_row.provider;
    return next;
  end if;
  return;
end;
$$;

-- =============================================================================
-- 3. create_auth_handoff
-- =============================================================================
create or replace function public.create_auth_handoff(
  p_user_id uuid
) returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_code text;
begin
  v_code := encode(gen_random_bytes(18), 'hex');
  insert into public.auth_handoffs (code, user_id)
  values (v_code, p_user_id);
  return v_code;
end;
$$;

-- =============================================================================
-- 4. consume_auth_handoff  (single-use + 60s invariants enforced here)
-- =============================================================================
create or replace function public.consume_auth_handoff(
  p_code text
) returns uuid
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_row public.auth_handoffs%rowtype;
begin
  -- Lock the row to prevent concurrent consumption
  select * into v_row
    from public.auth_handoffs
   where code = p_code
   for update;

  if not found then
    return null;
  end if;

  -- Single-use check
  if v_row.used_at is not null then
    return null;
  end if;

  -- Expiry check (60s window from creation)
  if v_row.expires_at <= now() then
    return null;
  end if;

  -- Mark used
  update public.auth_handoffs
     set used_at = now()
   where code = p_code;

  return v_row.user_id;
end;
$$;

-- =============================================================================
-- 5. attach_connection  (upsert; tokens stored encrypted)
-- =============================================================================
create or replace function public.attach_connection(
  p_user_id             uuid,
  p_provider            connection_provider,
  p_external_account_id text,
  p_access              text,
  p_refresh             text,
  p_expires             timestamptz,
  p_scopes              text,
  p_status              connection_status,
  p_config              jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_id           uuid;
  v_enc_access   text;
  v_enc_refresh  text;
begin
  v_enc_access  := public.encrypt_token(p_access);
  v_enc_refresh := public.encrypt_token(p_refresh);

  insert into public.connections (
    user_id, provider, external_account_id,
    access_token, refresh_token,
    expires_at, scopes, status, config
  )
  values (
    p_user_id, p_provider, p_external_account_id,
    v_enc_access, v_enc_refresh,
    p_expires, p_scopes, p_status, p_config
  )
  on conflict (user_id, provider) do update
    set external_account_id = excluded.external_account_id,
        access_token        = excluded.access_token,
        refresh_token       = excluded.refresh_token,
        expires_at          = excluded.expires_at,
        scopes              = excluded.scopes,
        status              = excluded.status,
        config              = excluded.config
  returning id
  into v_id;

  return v_id;
end;
$$;

-- =============================================================================
-- 6. activate_connection  (flip status; enqueue plan-push backfill)
-- =============================================================================
create or replace function public.activate_connection(
  p_connection_id uuid,
  p_config        jsonb
) returns void
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_user_id  uuid;
  v_provider connection_provider;
  v_plan     record;
begin
  -- Update config and flip status (pending_config -> active; already active stays active)
  update public.connections
     set config = p_config,
         status = case
                    when status = 'pending_config' then 'active'::connection_status
                    else status
                  end
   where id = p_connection_id
  returning user_id, provider
  into v_user_id, v_provider;

  if not found then
    return;
  end if;

  -- Enqueue plan-push backfill for pending planned_sessions missing the provider ref
  if v_provider = 'google_calendar' then
    for v_plan in
      select id
        from public.planned_sessions
       where user_id           = v_user_id
         and status            = 'pending'
         and calendar_event_id is null
    loop
      perform pgmq.send(
        'plan_push_queue',
        jsonb_build_object('user_id', v_user_id, 'plan_id', v_plan.id, 'op', 'create')
      );
    end loop;

  elsif v_provider = 'notion' then
    for v_plan in
      select id
        from public.planned_sessions
       where user_id        = v_user_id
         and status         = 'pending'
         and notion_page_id is null
    loop
      perform pgmq.send(
        'plan_push_queue',
        jsonb_build_object('user_id', v_user_id, 'plan_id', v_plan.id, 'op', 'create')
      );
    end loop;

  -- strava: no plan-push backfill needed
  end if;
end;
$$;

-- =============================================================================
-- 7. find_strava_connection
-- =============================================================================
create or replace function public.find_strava_connection(
  p_athlete_id text
) returns table(user_id uuid, connection_id uuid)
  language sql
  security definer
  set search_path = public, extensions
as $$
  select user_id, id as connection_id
    from public.connections
   where provider             = 'strava'
     and external_account_id = p_athlete_id;
$$;

-- =============================================================================
-- Grants: revoke from public/anon/authenticated; grant to service_role only
-- =============================================================================
revoke all on function public.create_oauth_state(connection_provider, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_oauth_state(text)
  from public, anon, authenticated;
revoke all on function public.create_auth_handoff(uuid)
  from public, anon, authenticated;
revoke all on function public.consume_auth_handoff(text)
  from public, anon, authenticated;
revoke all on function public.attach_connection(uuid, connection_provider, text, text, text, timestamptz, text, connection_status, jsonb)
  from public, anon, authenticated;
revoke all on function public.activate_connection(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.find_strava_connection(text)
  from public, anon, authenticated;

grant execute on function public.create_oauth_state(connection_provider, uuid)       to service_role;
grant execute on function public.consume_oauth_state(text)                           to service_role;
grant execute on function public.create_auth_handoff(uuid)                           to service_role;
grant execute on function public.consume_auth_handoff(text)                          to service_role;
grant execute on function public.attach_connection(uuid, connection_provider, text, text, text, timestamptz, text, connection_status, jsonb) to service_role;
grant execute on function public.activate_connection(uuid, jsonb)                    to service_role;
grant execute on function public.find_strava_connection(text)                        to service_role;
