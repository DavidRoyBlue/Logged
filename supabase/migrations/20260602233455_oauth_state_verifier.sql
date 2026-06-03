-- Add code_verifier column to oauth_states for PKCE support
-- The verifier is generated at authorize-time and consumed at callback-time.

alter table public.oauth_states add column code_verifier text;

-- Drop the old 2-arg overload so the 3-arg version is unambiguous
drop function if exists public.create_oauth_state(connection_provider, uuid);

-- =============================================================================
-- create_oauth_state (replaces the version without p_code_verifier)
-- =============================================================================
create or replace function public.create_oauth_state(
  p_provider      connection_provider,
  p_user_id       uuid,
  p_code_verifier text default null
) returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_state text;
begin
  v_state := encode(gen_random_bytes(18), 'hex');
  insert into public.oauth_states (state, user_id, provider, code_verifier)
  values (v_state, p_user_id, p_provider, p_code_verifier);
  return v_state;
end;
$$;

-- =============================================================================
-- consume_oauth_state (now also returns code_verifier)
-- Must DROP first because the return type changes (adding code_verifier column)
-- =============================================================================
drop function if exists public.consume_oauth_state(text);
create or replace function public.consume_oauth_state(
  p_state text
) returns table(user_id uuid, provider connection_provider, code_verifier text)
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
begin
  return query
    delete from public.oauth_states o
    where  o.state      = p_state
      and  o.expires_at > now()
    returning o.user_id, o.provider, o.code_verifier;
end;
$$;

-- =============================================================================
-- Grants: revoke old signatures, re-grant to service_role only
-- =============================================================================

-- Revoke and re-grant the NEW three-arg signature
revoke all on function public.create_oauth_state(connection_provider, uuid, text)
  from public, anon, authenticated;

revoke all on function public.consume_oauth_state(text)
  from public, anon, authenticated;

grant execute on function public.create_oauth_state(connection_provider, uuid, text) to service_role;
grant execute on function public.consume_oauth_state(text)                           to service_role;
