-- Token encryption functions using Supabase Vault for key storage.
-- Only the service_role may call decrypt_token; anon/authenticated are denied.

-- 1. Bootstrap the encryption key in Vault (idempotent — only creates if absent).
--    Key is randomly generated (32 bytes) — never hardcoded in git.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'token_encryption_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'token_encryption_key',
      'App token encryption key (dev: random per DB; override in prod)'
    );
  end if;
end $$;

-- 2. encrypt_token: wrap pgp_sym_encrypt; key read from Vault at call time.
create or replace function public.encrypt_token(plain text)
  returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  enc_key text;
begin
  if plain is null then
    return null;
  end if;

  select decrypted_secret
    into enc_key
    from vault.decrypted_secrets
   where name = 'token_encryption_key'
   limit 1;

  return encode(pgp_sym_encrypt(plain, enc_key)::bytea, 'base64');
end;
$$;

-- 3. decrypt_token: decode base64, pgp_sym_decrypt; key from Vault.
create or replace function public.decrypt_token(cipher text)
  returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  enc_key text;
begin
  if cipher is null then
    return null;
  end if;

  select decrypted_secret
    into enc_key
    from vault.decrypted_secrets
   where name = 'token_encryption_key'
   limit 1;

  return pgp_sym_decrypt(decode(cipher, 'base64')::bytea, enc_key);
end;
$$;

-- 4. Revoke all access then grant only to service_role.
--    Revoke from PUBLIC pseudo-role AND the concrete PostgREST roles
--    so that anon/authenticated callers are denied.
revoke all on function public.encrypt_token(text) from public, anon, authenticated;
revoke all on function public.decrypt_token(text) from public, anon, authenticated;

grant execute on function public.encrypt_token(text) to service_role;
grant execute on function public.decrypt_token(text) to service_role;