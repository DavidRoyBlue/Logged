create or replace function pgmq_purge(queue_name text)
returns bigint language sql security definer set search_path = pgmq, public as $$
  select pgmq.purge_queue(queue_name);
$$;
revoke all on function pgmq_purge(text) from public, anon, authenticated;
grant execute on function pgmq_purge(text) to service_role;