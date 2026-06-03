-- Webhook routing SQL functions: pgmq ack wrappers + strava ingest/deauth + soft-delete
-- All SECURITY DEFINER, pinned search_path; service_role only.

-- =============================================================================
-- 1. pgmq_delete  — ack wrapper: remove a message from the queue
-- =============================================================================
create or replace function public.pgmq_delete(queue_name text, msg_id bigint)
returns boolean
  language sql
  security definer
  set search_path = public, extensions
as $$
  select pgmq.delete(queue_name, msg_id);
$$;

-- =============================================================================
-- 2. pgmq_archive  — ack wrapper: move a message to the archive table
-- =============================================================================
create or replace function public.pgmq_archive(queue_name text, msg_id bigint)
returns boolean
  language sql
  security definer
  set search_path = public, extensions
as $$
  select pgmq.archive(queue_name, msg_id);
$$;

-- =============================================================================
-- 3. enqueue_strava_ingest  — edge-filter: only active connections enqueue
-- =============================================================================
create or replace function public.enqueue_strava_ingest(
  p_athlete_id        text,
  p_strava_activity_id bigint,
  p_op                text
) returns boolean
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  select user_id
    into v_user_id
    from public.connections
   where provider             = 'strava'
     and external_account_id = p_athlete_id
     and status              = 'active'
   limit 1;

  if not found then
    return false;
  end if;

  perform pgmq.send(
    'ingest_queue',
    jsonb_build_object(
      'user_id',             v_user_id,
      'strava_activity_id',  p_strava_activity_id,
      'op',                  p_op
    )
  );

  return true;
end;
$$;

-- =============================================================================
-- 4. handle_strava_deauth  — revoke all strava connections for an athlete
-- =============================================================================
create or replace function public.handle_strava_deauth(
  p_athlete_id text
) returns void
  language sql
  security definer
  set search_path = public, extensions
as $$
  update public.connections
     set status = 'revoked'
   where provider             = 'strava'
     and external_account_id = p_athlete_id;
$$;

-- =============================================================================
-- 5. soft_delete_activity  — mark deleted; un-match plans; enqueue revert jobs
-- =============================================================================
create or replace function public.soft_delete_activity(
  p_user_id            uuid,
  p_strava_activity_id bigint
) returns void
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_activity_id uuid;
  v_plan        record;
begin
  -- Resolve activity id; no-op if it doesn't exist
  select id
    into v_activity_id
    from public.activities
   where user_id            = p_user_id
     and strava_activity_id = p_strava_activity_id;

  if not found then
    return;
  end if;

  -- Soft-delete the activity
  update public.activities
     set deleted_at = now()
   where id = v_activity_id;

  -- Soft-delete associated outbound records
  update public.outbound_records
     set deleted_at = now()
   where activity_id = v_activity_id;

  -- Un-match any planned sessions and enqueue revert jobs
  for v_plan in
    select id, user_id
      from public.planned_sessions
     where matched_activity_id = v_activity_id
  loop
    update public.planned_sessions
       set status              = 'pending',
           matched_activity_id = null
     where id = v_plan.id;

    perform pgmq.send(
      'plan_push_queue',
      jsonb_build_object(
        'user_id', v_plan.user_id,
        'plan_id', v_plan.id,
        'op',      'revert'
      )
    );
  end loop;
end;
$$;

-- =============================================================================
-- Grants: revoke from public/anon/authenticated; grant to service_role only
-- =============================================================================
revoke all on function public.pgmq_delete(text, bigint)
  from public, anon, authenticated;
revoke all on function public.pgmq_archive(text, bigint)
  from public, anon, authenticated;
revoke all on function public.enqueue_strava_ingest(text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.handle_strava_deauth(text)
  from public, anon, authenticated;
revoke all on function public.soft_delete_activity(uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.pgmq_delete(text, bigint)                 to service_role;
grant execute on function public.pgmq_archive(text, bigint)                to service_role;
grant execute on function public.enqueue_strava_ingest(text, bigint, text) to service_role;
grant execute on function public.handle_strava_deauth(text)                to service_role;
grant execute on function public.soft_delete_activity(uuid, bigint)        to service_role;
