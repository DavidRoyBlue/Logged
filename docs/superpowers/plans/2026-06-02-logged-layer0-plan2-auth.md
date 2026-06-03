# Logged Layer 0 — Plan 2: Auth & Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every task. Steps use `- [ ]`.

**Goal:** The full auth + connection lifecycle: Strava-OAuth-bootstrap or email/Google + link; EF-mediated OAuth with CSRF state + PKCE + single-use 60s session handoff; encrypted token storage; connection activation that enqueues a backfill-push.

**Architecture:** DB-resident logic (handoff, oauth-state, token crypto, connection link/activate) as SECURITY DEFINER SQL functions tested via `@logged/db-tests`. Pure OAuth helpers (state, PKCE, authorize-URL, code-exchange, refresh) in `supabase/functions/_shared/` (Deno, `deno test`). Thin Deno edge functions wire helpers→RPCs. Expo auth client uses `expo-auth-session` (mocked in RTL tests).

**Tech Stack:** Postgres (pgcrypto), Supabase Edge Functions (Deno), Vitest (db-tests), Deno test, Expo + expo-auth-session/expo-web-browser, @testing-library/react-native.

---

## Tasks

### Task 1 — Token encryption (pgcrypto) SQL functions
- Migration: create an app encryption key as a Vault secret (local dev value via seed); `encrypt_token(plain text) returns text` and `decrypt_token(cipher text) returns text` using `pgp_sym_encrypt/decrypt` with the Vault key, SECURITY DEFINER, pinned search_path.
- db-test: round-trip (`decrypt_token(encrypt_token(x)) = x`), ciphertext ≠ plaintext, and that an authenticated user cannot call `decrypt_token` (revoke execute from anon/authenticated; grant to service_role only).

### Task 2 — oauth_states + auth_handoffs SQL functions
- `create_oauth_state(provider, user_id) returns text` (random state, 10-min expiry, inserts row).
- `consume_oauth_state(state) returns table(user_id uuid, provider connection_provider)` — returns the row and DELETES it; returns nothing if missing/expired.
- `create_auth_handoff(user_id) returns text` (random code, 60s expiry).
- `consume_auth_handoff(code) returns uuid` — atomically marks `used_at`, returns user_id only if unused AND unexpired; raises/returns null otherwise. **Single-use + 60s are invariants.**
- db-tests: state create→consume once (second consume empty); expired state not returned; handoff single-use (second consume null), expired handoff null.

### Task 3 — connection link/activate SQL functions
- `link_or_create_strava_user(athlete_id text, access text, refresh text, expires timestamptz, scopes text) returns uuid` — if a strava connection with that athlete exists, return its user; else create an `auth.users` row (via `auth.admin`? not from SQL) — NOTE: user creation must happen in the edge function via Admin API, so this function instead handles the *connection* upsert given a user_id: `attach_connection(user_id, provider, external_account_id, access, refresh, expires, scopes, status, config)` storing **encrypted** tokens via `encrypt_token`. Unique(user_id, provider) → upsert.
- `activate_connection(connection_id, config jsonb) returns void` — sets config, flips `pending_config`→`active`, and **enqueues a `plan_push_queue` job per pending planned_session with a null ref for that provider** (the backfill-push from the spec).
- `find_strava_connection(athlete_id text) returns table(user_id uuid, connection_id uuid)` — for the bootstrap lookup.
- db-tests: attach stores encrypted token (raw column ≠ plaintext, decrypt matches); upsert updates not duplicates; activate flips status + enqueues plan-push jobs for pending plans with null ref; find returns the right user.

### Task 4 — Deno _shared OAuth helpers
- `supabase/functions/_shared/oauth.ts`: `randomState()`, `pkcePair()` (verifier + S256 challenge), `buildAuthorizeUrl(cfg, {state, challenge?})`, `exchangeCode(cfg, code, verifier?, fetchImpl)` → tokens, `refreshAccessToken(cfg, refreshToken, fetchImpl)` → tokens. Provider configs (strava/google/notion endpoints, scopes) in `_shared/providers.ts`.
- `deno test`: PKCE challenge is base64url(SHA256(verifier)); authorize URL contains client_id/redirect_uri/scope/state/code_challenge; exchangeCode posts correct body and parses tokens (injected fetch fake); refresh likewise.

### Task 5 — Deno edge functions (thin wiring)
- `oauth-strava`, `oauth-google-calendar`, `oauth-notion`: GET authorize (create state, redirect to provider) + GET callback (verify state via RPC, exchange code, for strava: lookup/create user via Admin API + attach_connection + create_auth_handoff → 302 `logged://oauth/callback?code=...`; for calendar/notion: attach as pending_config for the JWT user). 
- `session-exchange`: POST {code} → `consume_auth_handoff` → mint session (verify exact Supabase admin API: prefer `auth.admin.generateLink`/`createSession` per installed version) → return session.
- Tests: `deno test` on the pure request/response builders that are factored out; full handler is integration-deferred (DEFERRED.md). At minimum each function module imports cleanly under `deno check`.

### Task 6 — Expo auth client
- `apps/mobile/lib/auth.ts`: `useSession()` hook (Supabase client + session state), `signInWithStrava()` (opens `expo-web-browser` auth session to the EF authorize URL, catches `logged://oauth/callback?code=`, calls session-exchange, sets session), `connect(provider)` for calendar/notion, deep-link handler.
- `apps/mobile/lib/supabase.ts`: configured Supabase client (env-driven URL/anon key).
- RTL tests with mocked `expo-web-browser` + a fake fetch/Supabase: signInWithStrava opens the browser, exchanges the returned code, and stores a session; connect builds the right URL.

## Self-review checklist
- Single-use/60s handoff enforced in SQL and tested. Tokens stored encrypted (verified raw≠plaintext). activate_connection enqueues plan-push. PKCE challenge correct. No secrets committed. Deno code `deno check`s. Expo auth tested with mocks.
