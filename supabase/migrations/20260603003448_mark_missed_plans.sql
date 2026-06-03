-- mark_missed_plans()
-- Sweeps planned_sessions for pending rows whose planned_date has fallen past the
-- ±36h match window (>2 days ago) and marks them 'missed'.
-- Returns the count of rows updated.
-- SECURITY DEFINER so it can bypass RLS; search_path is pinned to prevent hijacking.
-- Only the service_role is granted EXECUTE.

create or replace function mark_missed_plans()
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  update planned_sessions
  set status = 'missed',
      updated_at = now()
  where status = 'pending'
    and planned_date < (current_date - interval '2 days');

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- Revoke from public, grant only to service_role
revoke execute on function mark_missed_plans() from public;
grant execute on function mark_missed_plans() to service_role;
