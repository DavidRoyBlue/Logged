# Logged — Layer 0 Design Spec

**Date:** 2026-06-02
**Status:** Approved for implementation planning
**Scope:** Layer 0 — Foundation & the full automation loop

---

## 1. Product Context

**Logged** is a mobile app that closes the gap between training plans, the run that
actually happens, and where it gets recorded. A user plans a session, runs it, and the
run auto-logs itself everywhere — no manual entry — while the app provides progression
stats Strava doesn't.

- **Product from day one**, with the builder as user zero (dogfooded).
- **The product is the full loop**, not one half: Strava ingestion (backend wedge) +
  stats/progression (frontend wedge).
- Built in **layers**; each layer is its own spec → ADRs → plan → build cycle.

### Product layers (roadmap)

- **Layer 0 (this spec):** Auth, Strava ingestion, the outbound sync loop
  (Calendar + Notion), plan management, a basic stats surface, and the full UI shell.
- **Layer 1:** Progression & per-run analysis — training load, pace/HR zones (exact,
  from streams), splits, "vs similar runs."
- **Layer 2:** Goals & plans — target races, on-pace tracking, race calendar.
- **Layer 3:** Consistency & habit — streaks, heatmaps.
- **Layer 4:** Smart coaching — LLM weekly recaps and recommendations (needs full history).

Layer 0 is scoped as a **thin vertical slice**: the entire loop works end to end, real
and multi-user, optimized for user zero. Subsequent phases harden the foundation and
deepen the stats.

---

## 2. Architecture

### Hybrid: Supabase edges + Cloud Run workers

**Stays on Supabase (system of record + edges):**

- **Postgres** — application data **and** the `pgmq` job queue.
- **Auth + OAuth** — Strava / Google / Notion token storage + refresh.
- **Realtime** — pushes stat/activity updates to the Expo app.
- **`strava-webhook` Edge Function** — public HTTPS endpoint, **enqueue-only**, returns
  200 in ~50ms.

**Moves to Cloud Run (containerized brains):**

- **`ingest` worker** — fetch activity detail, normalize, upsert.
- **`sync` worker** — matcher, outbound adapters, (later) AI coaching.
- **`plan-push` worker** — inverse of ingest: pushes app-created plans out to
  Calendar/Notion.

### Wiring

- **Trigger:** when `strava-webhook` enqueues a job, a Supabase **Database Webhook**
  (or `pg_cron` via `net.http_post`) fires an HTTP **POST to the Cloud Run worker URL**,
  waking it from zero. `pgmq` is the durable buffer — nothing lost if Cloud Run is cold.
- **Cloud Run → Supabase:** workers connect to Postgres through the **Supavisor pooler
  (transaction mode, port 6543)** to avoid connection exhaustion. They pop jobs from
  `pgmq`, do the work, archive the message.
- **Safety net:** a **Cloud Scheduler** cron hits a `/drain` endpoint every minute to
  catch missed/retryable jobs and crashed backfills.
- Region-pin both platforms to the same region to minimize the network hop.

### End-to-end loop

```
You run → Strava → strava-webhook EF → enqueue (pgmq) → 200
                                              │
                          DB webhook / pg_cron wakes Cloud Run
                                              │
                                        ingest worker
                                 (fetch detail, normalize, upsert)
                                              │ enqueue sync job
                                         sync worker
                                              │
                                    matcher (pure, local query)
                              ┌───────────────┴───────────────┐
                          match found                     no match
                     complete planned_session         log new entry
                              │                              │
                    for each ACTIVE connection: adapter.apply(...)
                              │
                  Postgres written → Realtime → app refresh
```

Design principles baked in: workers are **decoupled** (webhook only enqueues; a slow
Notion API can't block ingestion); the **matcher and adapters are pure-ish modules** with
narrow interfaces (the parts most likely to grow, kept isolated); **Realtime** makes a
finished run "appear on its own."

---

## 3. Data Model

Postgres on Supabase. `auth.users` is the built-in identity; everything else hangs off
it. **RLS on every table** — a user only ever sees their own rows.

### `profiles` — one row per user, extends `auth.users`

| Column | Notes |
|---|---|
| `id` | PK, FK→auth.users |
| `display_name`, `avatar_url`, `created_at` | |
| `tier` | `free \| pro` — first monetization seam |
| `backfill_status` | `none \| running \| done` (coarse, for UI) |
| `backfill_window` | `90d \| full` |
| `backfill_cursor` | timestamptz — `before=` pagination cursor (resume point) |
| `backfill_updated_at` | timestamptz — heartbeat; staleness ⇒ crashed job |
| `athlete_zones` | jsonb — pulled from `GET /athlete/zones` at Strava connect |

### `connections` — one row per linked external account

| Column | Notes |
|---|---|
| `id`, `user_id` | FK |
| `provider` | `strava \| google_calendar \| notion` |
| `external_account_id` | Strava athlete id / Notion bot id |
| `access_token`, `refresh_token`, `expires_at` | **encrypted at rest (Supabase Vault)** |
| `scopes` | |
| `status` | `pending_config \| active \| expired \| revoked` |
| `config` | jsonb — e.g. `calendar_id`, `notion_database_id` |
| `created_at` | |

- Unique `(user_id, provider)` — one calendar, one Notion DB per user (Layer 0).
- **Google *sign-in* is NOT a connections row** — it lives in Supabase-managed
  `auth.identities`. Only `google_calendar` (a distinct `calendar.events` consent)
  appears here.

### `activities` — normalized completed runs/workouts (stats source of truth)

| Column | Notes |
|---|---|
| `id`, `user_id` | |
| `strava_activity_id` | unique per user — dedup key |
| `type`, `start_time`, `timezone` | |
| `distance_m`, `moving_time_s`, `elapsed_time_s` | |
| `avg_pace_s_per_km` | computed |
| `avg_hr`, `max_hr`, `elevation_gain_m`, `calories`, `name` | |
| `workout_type` | int, from `raw.workout_type` — `1` = race |
| `zone_distribution` | jsonb nullable — `{z1_seconds…z5_seconds}` (**approximate** at L0) |
| `raw` | jsonb — full payload (summary for backfill, detail for live) |
| `ingested_at`, `deleted_at` | soft-delete |

### `planned_sessions` — app-owned plans (the matcher's only source)

| Column | Notes |
|---|---|
| `id`, `user_id` | |
| `type`, `planned_date`, `target_distance_m` | nullable target |
| `title`, `description` | |
| `status` | `pending \| completed \| missed` |
| `matched_activity_id` | nullable FK→activities |
| `calendar_event_id` | nullable text — set when pushed to Calendar |
| `notion_page_id` | nullable text — set when pushed to Notion |
| `created_at`, `updated_at` | |

Plans **originate in the app** and are pushed *out*. No `source`/`source_ref` — we never
read plans back from external sources in Layer 0.

### `outbound_records` — idempotency + retry tracking (one per activity × destination)

| Column | Notes |
|---|---|
| `id`, `user_id` | |
| `activity_id` | FK |
| `connection_id` | FK → destination |
| `external_ref` | Calendar event id / Notion page id created or completed |
| `action` | `completed_plan \| logged_new` |
| `status` | `pending \| ok \| failed` (`failed` = retries exhausted) |
| `retry_count` | int, default 0, **cap 3** |
| `error` | last error text |
| `synced_at` | |

- Unique `(activity_id, connection_id)` — an activity is **never double-pushed** to the
  same destination; re-runs *update* the existing `external_ref`.

### `oauth_states` — CSRF nonce for custom OAuth flows

`state` (PK), `user_id` (nullable — null for new-signup), `provider`, `expires_at`
(now()+10m). Written before redirect, verified on callback before code exchange, deleted
after.

### `auth_handoffs` — single-use session handoff (mobile OAuth)

`code` (PK), `user_id`, `expires_at` (**now()+60s**), `used_at`. **60s TTL and single-use
are load-bearing invariants, not tunables.**

### `pgmq` queues

`ingest_queue`, `sync_queue`, `plan_push_queue`. Small payloads:
`{user_id, strava_activity_id, op}` or `{user_id, backfill_page}` or `{user_id, plan_id, op}`.

### Key invariants

- An activity completes **0 or 1** `planned_session`.
- An activity fans out to **N** `outbound_records` (one per active destination).
- `raw` means stats recompute from stored data — no Strava re-fetch (per-activity detail
  re-fetched only when Layer 1 needs streams).
- 3-strike dead-letter applies to **all** queues (ingest, sync, plan-push, outbound).

---

## 4. Auth & Connection Flows

**Rule:** identity = a Supabase `auth.users` row; external accounts = `connections` rows.
Strava/Notion/Google-Calendar OAuth are **custom (EF-mediated)**; Google **sign-in** is
native Supabase Auth.

### Two distinct Google flows (explicit — do not conflate)

| | Sign in with Google | Connect Google Calendar |
|---|---|---|
| Mechanism | **Native** `supabase.auth.signInWithOAuth({provider:'google'})` | **Custom** `oauth-google-calendar` EF |
| Scope | email + profile | `calendar.events` |
| Result | Supabase session directly | `connections` row → `pending_config` → pick calendar → `active` |
| Stored | Supabase-managed `auth.identities` | our `connections` table |

> **Do not wire the Calendar connection through `signInWithOAuth`** — sign-in tokens do
> not grant calendar access; that mistake ships a silent permissions failure.

### Flow 1 — "Sign in with Strava" (creates *or* resumes account)

```
App → Strava OAuth consent → oauth-strava EF
  verify state → exchange code (server-side, client_secret) → {athlete_id, tokens}
  lookup connections WHERE provider='strava' AND external_account_id=athlete_id
    ├─ found → resume: mint Supabase session for that user_id
    └─ none  → create auth user (Admin API) + profile + strava connection,
               pull athlete_zones, kick off 90-day backfill, mint session
  write auth_handoffs row → redirect logged://oauth/callback?code=<handoff>
App → session-exchange EF (verify unused+unexpired, mark used_at, mint session)
```

### Flow 2 — Email/Google signup, then link Strava

- Sign up via **native Supabase Auth** (email OTP or Google provider) → `user_id`.
- "Connect Strava" → same `oauth-strava` EF, reads `user_id` from JWT, **attaches** the
  connection (instead of creating a user), pulls zones, triggers backfill.

### Flow 3 — Link outbound destinations (Calendar / Notion)

- Logged-in user → provider OAuth (EF-mediated) → `connections` row as **`pending_config`**
  (tokens stored, target not chosen).
- "Pick calendar / pick database" screen sets `config` → flips to **`active`**.
- **Backfill-push on activation:** when a connection goes `pending_config → active`,
  enqueue a `plan-push` for every `pending` planned_session with a null ref for that
  connection.

### Mobile OAuth redirect strategy

`expo-auth-session` + `WebBrowser.openAuthSessionAsync`, custom scheme `logged://`, **no
Expo proxy**. The provider `redirect_uri` points at the **Supabase EF (HTTPS)**, not the
app — because Strava/Notion require a `client_secret` to exchange the code, which must
stay server-side.

```
App opens system browser → provider authorize URL (redirect_uri = EF HTTPS)
Provider → EF: verify state → exchange code w/ secret → create/link user
EF → 302 logged://oauth/callback?code=<one-time handoff>
WebBrowser catches deep link → app calls session-exchange EF → Supabase session
```

`scheme: "logged"` in `app.json`; redirect URIs registered with each provider = the EF
HTTPS URLs.

### Cross-cutting

- **Token storage/refresh:** encrypted via Vault. Workers **refresh-on-use** before any
  Strava/Google/Notion call if `expires_at` is near. Refresh failure ⇒ connection
  `expired` ⇒ app "reconnect" nudge (do not dead-letter the activity over a stale token).
- **`state`/PKCE:** all three custom flows (Strava, Google-Calendar, Notion) generate a
  `state` nonce (`oauth_states`) verified before code exchange; PKCE where supported
  (Notion/Google; Strava does not).
- **Session minting:** the exact "mint session from `user_id`" SDK call
  (`auth.admin.createSession` vs `auth.admin.generateLink` → verify) **must be verified
  against the current `@supabase/supabase-js` version** during implementation — the
  architecture (server-side minting gated by single-use handoff) holds either way.
- **Collision rule (L0):** one Strava athlete ↔ one app user. Linking an already-attached
  Strava is blocked with a clear message (no account merge).
- **Disconnect:** revoking sets `status='revoked'`; stored activities remain.

---

## 5. Ingestion Pipeline

Three entry points (live webhook, backfill, edits/deletes) converge on one normalize +
upsert.

### Webhook subscription (one-time, app-level)

- One subscription points at `strava-webhook` EF.
- Strava sends a **GET validation** with `hub.challenge` + `hub.verify_token` — EF checks
  token and echoes challenge. Thereafter all athletes' events arrive as POSTs.

### `strava-webhook` EF (enqueue-only)

Event: `{object_type, object_id, aspect_type, owner_id, event_time, updates}`.

- `activity` + `create|update` → map `owner_id`→`user_id` via `connections`; **check
  `connections.status` — revoked/expired ⇒ treat as unknown ⇒ 200 + ignore** (filter at
  the edge); else enqueue to `ingest_queue`.
- `aspect_type=delete` → enqueue delete job (see below).
- `athlete` + `updates.authorized='false'` → **deauthorization**: mark Strava connection
  `revoked`.
- Returns **200 immediately** (Strava retries on non-200). Unknown athlete → 200 + ignore.

### `ingest` worker (Cloud Run)

1. Pop from `ingest_queue`.
2. Refresh-on-use Strava token if near expiry.
3. `GET /activities/{id}` for full detail.
4. **Type filter:** only run/workout types in a configurable allowed set; others acked +
   dropped.
5. **Normalize** → distance, times, computed pace, HR, elevation, calories, start_time +
   tz; `workout_type` from `raw.workout_type`; `zone_distribution` from `avg_hr` +
   `athlete_zones`; stash full payload in `raw`. `normalize()` accepts **summary or
   detail** payloads and emits identical columns.
6. **Upsert** on `(user_id, strava_activity_id)` — create/update idempotent; duplicate
   webhooks can't double-insert.
7. Enqueue `sync_queue` job.

### Delete job

Soft-delete the activity (`deleted_at`), soft-delete its `outbound_records`, **and** if a
`planned_session.matched_activity_id` points at it → flip that session back to
`status='pending'`, clear `matched_activity_id`, **and enqueue an outbound `revert`** so
the external side reopens (see §6). Keeps history consistent — no "completed plan with no
backing activity."

### Backfill

| | 90-day (default, **free**) | Full history (**pro**) |
|---|---|---|
| Runtime | **Cloud Run *service*, single invocation** | **Cloud Run *Job*** (batch, 24h ceiling) |
| Source | **list endpoint summary payload only** (no per-activity detail fetch) | same, paginated to start |
| Cost/scale | ~5 API calls, 30–90s, ~$0.002/user | checkpoint-resumable via `backfill_cursor` |
| Trigger | first Strava connect | user-initiated, **tier-gated** |

- Paginated over `GET /athlete/activities?per_page=100`. **Rate-limit aware** (reads
  `X-RateLimit-Usage/Limit`, backs off on `429`).
- **Resumable:** `backfill_cursor` + `backfill_updated_at` heartbeat; `status='running'`
  with stale heartbeat (>5 min) = crashed ⇒ `/drain` sweeper resumes from cursor.
- Backfill stores the **summary** in `raw` (carries all Layer 0 fields). Per-activity
  detail fetches happen **only live** (webhook→ingest). If Layer 1 needs streams/laps for
  an old activity, it re-fetches on demand.
- Dedup is free via the `(user_id, strava_activity_id)` upsert.

### Reconciliation sweep

`pg_cron` (~hourly) lists each active athlete's recent Strava activities and enqueues any
missing from `activities`. Safety net for dropped webhooks — makes auto-logging
trustworthy. Idempotent via upsert.

### Deliberate L0 scopes

Runs/workouts only (configurable set); deletes are soft; no GPS-stream/lap data yet (`raw`
keeps the door open).

---

## 6. Sync Loop — Matcher + Outbound Adapters

**Direction (decided):** the **app is the source of truth** for plans. Plans are created
in-app, pushed *out* to Calendar/Notion, and Strava activities close the loop by marking
them complete. We never read plans back from external sources in Layer 0. ("Import
existing Calendar/Notion plans" is a discrete future feature.)

### `plan-push` worker (inverse of ingest)

```
plan created / edited / deleted in app → plan_push_queue
→ for each ACTIVE connection:
     create:  CREATE event/page → store calendar_event_id / notion_page_id on session
     edit:    UPDATE via stored ref
     delete:  DELETE via stored ref, then remove the session
```

- **Plan with no active connection = a valid app-only plan** (refs null). The app shows a
  nudge ("Connect Google Calendar or Notion to post this plan") but does not force it.
- **Per-destination sync state** is visible on each plan (synced icon, or "not posted ·
  connect to sync").

### Sync worker (matcher is a pure local query — no external I/O)

```
pop {user_id, activity_id} → load activity
candidates = planned_sessions
   WHERE user_id=? AND status='pending'
     AND planned_date WITHIN ±36h of activity.start_time   (window configurable)
matchResult = matcher(activity, candidates)   // date proximity + type + distance, scored
match:    session.status='completed'; matched_activity_id=activity.id
          for each active connection: adapter.apply(completed_plan)
no match: for each active connection: adapter.apply(logged_new)
write outbound_records → Realtime → app
```

**Matcher** scores candidates on date proximity, type compatibility (Run↔Run), and
distance proximity (within ±20% if the plan has a target). Best above threshold ⇒
`completed_plan`; else `logged_new`. Ties ⇒ highest score, earliest plan. Records a
`confidence` for future low-confidence review. **One activity completes ≤1 plan.**

### Outbound adapter contract

```
interface OutboundDestination {
  apply(activity, matchResult) → externalRef
     // completed_plan: UPDATE existing item (ref pre-created on plan push)
     //   if ref is null (rare race): CREATE-as-already-completed (never silently drop)
     // logged_new: CREATE item
  revert(outboundRecord) → void
     // completed_plan: restore the plan's event to un-completed state (DO NOT delete — plan still exists)
     // logged_new: DELETE the created item
}
```

- **Idempotency:** `outbound_records` unique `(activity_id, connection_id)` — re-runs
  update the existing `external_ref`. 3-strike dead-letter on failure.
- **GoogleCalendarAdapter:** `completed_plan` → update matched event (✅ title prefix +
  actuals in description + colorId). `logged_new` → create event. (No real checkbox;
  completion = ✅/color convention.)
- **NotionAdapter:** `completed_plan` → update matched page (`Status=Done` + Actual
  Distance/Pace/Duration). `logged_new` → create page in the configured DB.

### `missed` status

A `pg_cron` sweep flips `pending → missed` once a plan's date window passes with no match
(optionally pushing a "missed" annotation out). Makes "planned but didn't run" visible.

---

## 7. UI Shell + Stats

### Full navigation built day one (WIRED vs SHELL)

```
Home      → Home (WIRED: week card, bar chart, activity feed, Realtime)
Activities→ Feed (WIRED) · Detail (WIRED) · Training load (SHELL·L1)
Plans     → List/calendar (WIRED) · Create/edit (WIRED→plan-push) · Race calendar (SHELL·L2)
Progress  → Zone-pace trends (SHELL·L1) · PR tracker (SHELL·L1) · Race history (SHELL·L1)
            · Fitness metrics (SHELL·L2) · AI coaching (SHELL·L4)
Settings  → Connections (WIRED) · Zones setup (SHELL·L1) · Profile (WIRED) · Notif prefs (SHELL·L2)
```

Every screen + tab exists; SHELL screens render a consistent **"coming soon" empty state**
with stubbed data hooks — no dead tabs. We simplify down from this shell, never retrofit.

### WIRED screen detail

- **Home** — *This week* card (distance, time, # runs, Δ vs last week) + weekly-distance
  bar chart over the 90-day window + recent activity feed. **Realtime-updated** — a
  finished run appears on its own (the core payoff).
- **Activity detail** — normalized fields + races flagged (`workout_type`) + basic per-run
  zone split + "completed *Tuesday tempo*" if matched.
- **Plans** — pending (with per-destination sync badges), completed (with the closing
  run), missed; create/edit fires `plan-push`.
- **Connections** — status cards (`active` / `pending_config` "finish setup" / `expired`
  "reconnect"); tier-gated **Import full history** button.

### Stats data captured at ingest (rendered later)

Banked now (cheap at ingest, impossible to reconstruct later), surfaced as screens get
wired:

- **`workout_type`** — race detection → PR-per-distance, race history.
- **`zone_distribution`** — **approximate at L0** (whole moving-time bucketed by `avg_hr` +
  `athlete_zones`; honest label). **Exact requires HR stream** (Layer 1).
- **`athlete_zones`** — pulled at connect, refreshed by the periodic sweep.

Metrics the pipeline feeds (SHELL until their layer): Zone 2 pace-over-time, Zone 2 weekly
volume, aerobic decoupling, training distribution (80/20), race predictor (Riegel at L1,
LLM+history at L4), periodization tagging. Zone-2-pace and decoupling are what make the
**Layer 4 AI coach** meaningful — which is why full-history backfill is the paid tier.

---

## 8. Error Handling

- **Queues:** every worker shares **retry-with-backoff → 3-strike dead-letter** (~1m / 5m
  / 30m). Dead-letters surface in-app ("couldn't sync to Notion · Retry"), never silent.
- **Partial outbound failure isolated:** Calendar and Notion each get their own
  `outbound_records` row + own retry. One failing never blocks the other or the activity.
- **Token-refresh failure** → connection `expired` → "reconnect" nudge; activity not
  dead-lettered.
- **Webhook delivery not guaranteed** → hourly **reconciliation sweep** fills gaps.
- **Idempotency everywhere:** `(user_id, strava_activity_id)` and
  `(activity_id, connection_id)` make replays/reconciliation overlaps no-ops.
- **Security:** RLS on every table; tokens encrypted (Vault); secrets split Supabase Vault
  / GCP Secret Manager.

---

## 9. Testing Strategy

Test pyramid, TDD (`superpowers:test-driven-development`).

- **Pure units (heaviest coverage):**
  - **`matcher`** — date-window edges, type compatibility, distance tolerance, scoring,
    tie-breaks, threshold boundaries, multi-candidate selection.
  - **`normalize()`** — summary *and* detail payloads yield identical columns; pace/tz
    math; `workout_type` / `zone_distribution` derivation.
- **Adapters** — mocked Calendar/Notion APIs against the `OutboundDestination` contract:
  `completed_plan` UPDATE, `logged_new` CREATE, null-ref CREATE-as-completed, `revert()`
  for both actions, idempotent re-runs.
- **Integration** — workers against **local Supabase** (real `pgmq` + Postgres): enqueue →
  process → assert rows + dead-letter after 3 strikes.
- **Edge functions** — webhook validation handshake, routing (create/update/delete/deauth),
  revoked-connection skip; OAuth `state`/CSRF, handoff single-use + 60s expiry, two-Google-
  flows separation.
- **One E2E happy path** — simulated Strava webhook → ingest → sync → assert `activities`
  row + plan `completed` + `outbound_records` for both destinations (external APIs mocked/
  sandboxed).

---

## 10. Architecture Decision Records

Each gets its own ADR (`write-adr`) during planning:

1. **Mobile framework** → Expo / React Native.
2. **Backend platform** → Supabase (Postgres + Auth + Edge Functions + Realtime).
3. **Auth model** → unified identity; Strava-OAuth-bootstrap *or* email/Google + link.
4. **Async processing** → hybrid: Supabase edges + `pgmq`; Cloud Run workers; DB-webhook/
   `pg_cron` trigger; Supavisor pooler; Cloud Scheduler `/drain` safety net.
5. **Custom OAuth security** → `state` (CSRF) + PKCE-where-supported + single-use 60s
   session handoff; EF-mediated code exchange (secrets server-side).
6. **Mobile OAuth redirect** → `expo-auth-session`, custom scheme, EF-mediated, no Expo
   proxy.
7. **Outbound abstraction** → single `OutboundDestination` interface (apply + revert);
   Calendar + Notion as implementations.
8. **Plan source of truth** → app owns plans, pushes out; no external read-back in L0.
9. **Backfill strategy** → free 90-day (Cloud Run service, summary payload) / pro
   full-history (Cloud Run Job, checkpoint-resumable); tier boundary is **value-based**
   (AI coaching needs history), not compute-cost-based.
10. **Stats data capture at ingest** → `workout_type`, `zone_distribution` (approx),
    `athlete_zones` banked at L0 even though visualizations are shelled.

---

## Appendix — Deferred (explicitly out of Layer 0)

- Account merge (one Strava ↔ one user enforced).
- Multi-calendar / multi-Notion-DB per user (one each in L0).
- Importing existing plans from Calendar/Notion (discrete future feature).
- Exact (stream-based) zone distribution, splits, GPS analysis (Layer 1).
- Goals, race calendar, streaks/heatmaps, AI coaching (Layers 2–4).
- Always-on queue consumer on Fly/Render (documented escape hatch; not built).
