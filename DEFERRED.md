# Deferred / Autonomous-Run Decisions (Plans 2–5)

This file records decisions made and work deferred during the autonomous Plans 2–5 build,
for review. Anything here needs human follow-up (usually live credentials or deployment).

## Cross-cutting decisions

- **Deno/Node boundary (ADR 0011):** Supabase Edge Functions run on Deno and cannot import
  the pnpm workspace `@logged/core`. Pure auth/OAuth logic that edge functions need lives in
  `supabase/functions/_shared/` (Deno, with `deno test`). Logic the Cloud Run workers (Node)
  need lives in `@logged/core` / `@logged/worker` (Vitest). Where the same small algorithm is
  needed on both sides (e.g. token refresh request building), it is intentionally implemented
  twice — once per runtime — rather than forcing a shared package across the boundary.
- **External APIs are injected, never called in tests.** Strava/Google/Notion HTTP clients are
  passed in as interfaces; tests use fakes. Integration tests run against the live local
  Supabase stack only.
- **DB-resident logic is tested via the established `@logged/db-tests` Vitest harness.** Auth
  flows are implemented as SECURITY DEFINER SQL functions (handoff, oauth-state, connection
  link/activate) so they are testable without standing up edge functions.

## Deferred to human (needs live credentials / deployment)

- Real OAuth round-trips with Strava / Google / Notion (need registered apps + client
  secrets). The edge-function handlers and the pure helpers are unit-tested; the end-to-end
  browser consent → callback → session is manual.
- Cloud Run deployment + the DB-webhook/`pg_cron`→Cloud Run trigger wiring (infra).
- Strava webhook subscription registration (one-time, needs a public URL).
- Production secret material (encryption key, provider client secrets) — local uses a
  dev key created in a seed/migration.
- **mintSession exact call (Plan 2 Task 5):** `supabase_adapter.ts` uses
  `auth.admin.generateLink({ type: 'magiclink', email })` to mint session tokens.
  The correct production approach (generateLink vs createSession vs
  `auth.admin.createSession`) must be verified during live integration once real auth
  users are provisioned and the edge function is deployed. The current implementation
  extracts `properties.access_token` / `properties.refresh_token` from the generateLink
  response; this may need adjustment depending on the SDK version in the Deno runtime.
- **Google Calendar external_account_id (Plan 2 Task 5):** The Google OAuth token
  response does not include a stable account identifier in the token payload itself.
  `handleLinkedCallback` stores `null` for `external_account_id` on Google connections;
  a follow-up worker should populate it from the Calendar API's `userinfo` endpoint
  (or `calendar.settings.get`) after the connection is activated.

## Plan 5 Task 2 — Mobile WIRED screens (deferred items)

- **`Import full history` button (Settings screen):** The button is rendered and visible in
  `app/(tabs)/settings.tsx`. Pressing it shows an Alert explaining the feature is coming soon.
  The actual backend trigger (Edge Function or Cloud Run job) to import the full Strava history
  is server-side and deferred — wire once the worker endpoint `/jobs/import-history` is deployed.
  See `app/(tabs)/settings.tsx` `handleImportHistory`.

- **Live access token for google_calendar / notion connect:** `settings.tsx` reads
  `session?.access_token` from `useSession()` and passes it to `connect(provider, accessToken, deps)`.
  If the user is not authenticated at time of press, `accessToken` defaults to `""`, which the
  edge function will reject. The correct flow is: ensure the user has a Supabase session before
  showing these connect buttons, or redirect to auth. Deferred until the auth flow is wired end-to-end.

- **`useRealtimeActivities` — no integration test against a live socket:** The hook is tested
  at the smoke-test level (renders + mounts/unmounts without throwing) but not against a real
  Supabase Realtime socket. Integration testing requires a running Supabase stack and is deferred.

## Plan 3 Task 6 — pg_cron schedules (wire on deploy)

The reconciliation SQL function and worker are implemented and tested. The following
pg_cron schedules must be wired in production via the Cloud Run trigger (infra-deferred).
Do NOT create live cron jobs in migrations — all three are documented here only.

- **`mark_missed_plans()` — daily sweep**
  ```sql
  select cron.schedule('mark-missed-plans', '0 3 * * *', 'select mark_missed_plans()');
  ```
  Runs at 03:00 UTC daily. Flips any `planned_sessions` row with `status='pending'`
  and `planned_date < current_date - 2 days` to `status='missed'`.

- **Reconciliation — hourly gap-fill**
  The worker's `reconcileUser(userId, accessToken, {strava, db})` function must be
  invoked once per active Strava connection each hour. Mechanism: a Cloud Run HTTP
  trigger fires a POST to `/jobs/reconcile`; the handler queries all users with an
  active Strava connection and calls `reconcileUser` for each. The Cloud Run trigger
  is scheduled via pg_cron or Cloud Scheduler (TBD infra):
  ```sql
  -- pg_cron variant (fires DB-webhook -> Cloud Run)
  select cron.schedule('reconcile-all-users', '0 * * * *', '
    select net.http_post(
      url := current_setting(''app.worker_url'') || ''/jobs/reconcile'',
      headers := jsonb_build_object(''Authorization'', ''Bearer '' || current_setting(''app.worker_secret''))
    )
  ');
  ```
  `app.worker_url` and `app.worker_secret` are set as Postgres config parameters at
  deploy time.

- **pgmq drain — continuous**
  The ingest_queue and sync_queue are drained by the Cloud Run worker on each HTTP
  trigger (`/drain`). Scheduling the drain is part of the DB-webhook/Cloud Run trigger
  wiring (infra-deferred). No additional pg_cron entry is required if the webhook fires
  per-event; a fallback drain cron (e.g. every 2 minutes) is recommended as a safety net.

## Error handling — 3-strike dead-letter (not yet implemented)

The spec's per-job **retry-with-backoff → 3-strike dead-letter** policy is NOT yet wired
into the worker drain loops. Currently `drainIngestQueue` (and the sync/plan-push paths)
process a job and ack on success; a job that throws aborts the drain pass and leaves its
message unacked (so pgmq re-delivers it after the visibility timeout — effectively an
unbounded retry, not a capped one). `outbound_records` already has a `retry_count` column
and `status='failed'`, and pgmq tracks `read_ct` per message — so the dead-letter policy
should be implemented by: on job failure, increment a retry counter (pgmq `read_ct` or the
record's `retry_count`), and after 3 attempts archive the message (dead-letter) + mark the
row `failed` + surface it in-app, instead of re-queuing forever. Deferred as a focused
error-handling pass (it spans all worker queues).
