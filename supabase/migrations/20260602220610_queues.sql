select pgmq.create('ingest_queue');
select pgmq.create('sync_queue');
select pgmq.create('plan_push_queue');

-- Thin SECURITY DEFINER wrappers so the service-role API can send/read without direct pgmq schema grants.
-- pgmq.send returns SETOF bigint; unwrap to a single bigint via scalar subquery.
create or replace function pgmq_send(queue_name text, msg jsonb)
returns bigint language sql security definer set search_path = pgmq, public as $$
  select * from pgmq.send(queue_name, msg);
$$;

create or replace function pgmq_read(queue_name text, vt integer, qty integer)
returns setof pgmq.message_record language sql security definer set search_path = pgmq, public as $$
  select * from pgmq.read(queue_name, vt, qty);
$$;
