# Logged Layer 0 — Plan 3: Ingestion Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every task.

**Goal:** Strava → normalized `activities`: webhook routing, the ingest worker, full `normalize()`, tiered backfill, and the reconciliation/missed sweeps.

**Architecture:** `normalize()` is pure in `@logged/core` (fixtures, exhaustive unit tests). Webhook routing lives in SQL functions (testable via db-tests); the `strava-webhook` Edge Function is thin (validation handshake + enqueue). The ingest + backfill workers live in `@logged/worker` (Node), use an injected `StravaClient` interface (faked in tests) and a `Db` access layer over supabase-js service client; integration-tested against the live local Supabase. Reconciliation + missed-plan sweeps are SQL + `pg_cron`.

**Tech Stack:** @logged/core (Vitest), Postgres functions + pgmq, Supabase Edge Function (Deno), @logged/worker (Node, supabase-js, Vitest integration).

---

## Tasks

### T1 — `normalize()` full implementation (`@logged/core`)
- Signature: `normalize(payload: StravaActivityPayload, athleteZones?: AthleteZones | null): NormalizedActivity`. Accepts Strava **summary** or **detail** shape (both carry the Layer 0 fields).
- Map: id→stravaActivityId, name, distance→distanceM, moving_time→movingTimeS, elapsed_time→elapsedTimeS, total_elevation_gain→elevationGainM, type/sport_type→type, workout_type, start_date→startTime, timezone (parse the Strava `(GMT-05:00) America/New_York` → IANA tail), average_heartrate→avgHr, max_heartrate→maxHr, calories (detail; null on summary), compute avgPaceSPerKm via `computePaceSPerKm`.
- `zone_distribution` **approximation**: given `athleteZones.heart_rate.zones` (array of {min,max}, last max=-1=∞) and `avgHr`, bucket the WHOLE `movingTimeS` into the zone avgHr falls in; others 0. Null if no avgHr or no zones.
- Fixtures: `summary.json`, `detail.json`, `zones.json` under `packages/core/src/__fixtures__/`.
- Tests: summary and detail produce identical normalized core fields; pace correct; timezone parsed to IANA; workout_type passthrough (race=1); zone bucketing puts all time in the right zone; null-safe (missing hr → null pace/zones handled).

### T2 — Webhook routing SQL + pgmq consume wrappers
- `pgmq_delete(queue_name text, msg_id bigint) returns boolean` and `pgmq_archive(queue_name text, msg_id bigint) returns boolean` SECURITY DEFINER wrappers (service_role only) so workers can ack jobs.
- `enqueue_strava_ingest(p_athlete_id text, p_strava_activity_id bigint, p_op text) returns boolean` — find ACTIVE strava connection by athlete; if found enqueue `{user_id, strava_activity_id, op}` to `ingest_queue` and return true; if missing/revoked return false (edge-filter skip).
- `handle_strava_deauth(p_athlete_id text) returns void` — set the strava connection `status='revoked'`.
- db-tests: enqueue returns true + message present for active connection; returns false (no enqueue) for revoked/unknown; deauth flips status; delete/archive remove a message.

### T3 — `strava-webhook` Edge Function (Deno)
- Factored `handleWebhook(event, deps)`: GET validation echoes `hub.challenge` if `hub.verify_token` matches env; POST activity create/update → `enqueue_strava_ingest`; delete → enqueue a delete op; athlete `updates.authorized==='false'` → `handle_strava_deauth`. Always 200.
- deno tests (fake db deps): validation handshake; create routes to enqueue; revoked athlete (enqueue returns false) still 200; deauth calls handler; delete enqueues delete op. Thin entrypoint + `deno check`.

### T4 — Ingest worker (`@logged/worker`)
- `StravaClient` interface: `getActivity(id, accessToken)`, `listActivities(opts, accessToken)`, `refreshToken(refreshToken)`. Real impl (fetch) + `FakeStravaClient` for tests.
- `Db` layer (supabase-js service client): `getConnection`, `decrypt`, `updateConnectionToken`, `getProfileZones`, `upsertActivity`, `enqueueSync`, queue pop/ack via the pgmq RPCs.
- `processIngestJob({user_id, strava_activity_id, op}, {strava, db})`: load strava connection + decrypt token; refresh-on-use if near expiry (update connection); `getActivity`; type-filter (configurable Run/TrailRun/Workout set; drop others); `normalize` with profile zones; upsert activities on (user_id, strava_activity_id); enqueue sync. Delete op → soft-delete + un-match plan + enqueue outbound revert (call a SQL fn `soft_delete_activity`).
- Integration test (live local Supabase + FakeStravaClient): seed a user+active strava connection (encrypted token); run processIngestJob → asserts an activities row with normalized fields + a sync_queue message; token-refresh path exercised; non-run type dropped.

### T5 — Backfill worker (`@logged/worker`)
- `processBackfill({user_id, window}, {strava, db})`: paginate `listActivities` (summary), normalize+upsert each (summary in raw), update `profiles.backfill_cursor`/`backfill_updated_at`, set `backfill_status` running→done; window `90d` filters by `after`; `full` paginates to start. Tier-gate: full requires profile `tier='pro'` (else clamp to 90d + note).
- Integration test: FakeStravaClient returns 2 pages; processBackfill upserts all, sets cursor + status done; re-run is idempotent (upsert).

### T6 — Reconciliation + missed-plan sweeps (SQL/pg_cron + worker)
- `reconcile_user(p_user_id)` worker function: list recent Strava activities, enqueue any missing from `activities`. (Worker fn tested with fake.)
- SQL `mark_missed_plans()` — flip `pending`→`missed` for planned_sessions whose date window has fully passed with no match. db-test.
- `pg_cron` schedules (documented; not executed in tests): reconciliation hourly, mark_missed daily, pgmq drain. Note actual Cloud Run trigger wiring is deferred (DEFERRED.md).

## Self-review
normalize summary==detail on core fields; zone approx correct + honestly labeled; webhook always 200 + revoked-skip; ingest idempotent upsert + refresh-on-use + sync enqueue; backfill resumable + tier-gated; missed sweep works. External APIs faked in tests; integration against live local DB.
