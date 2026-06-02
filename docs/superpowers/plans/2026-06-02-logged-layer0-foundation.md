# Logged Layer 0 — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, documentation structure, database schema (with RLS + `pgmq`), shared pure-logic package, and a building Expo skeleton — the foundation every later Layer 0 plan builds on.

**Architecture:** pnpm-workspace monorepo. Pure domain logic (types, `normalize`, `matcher`) lives in `packages/core` with zero I/O so it is exhaustively unit-testable and shared by the Cloud Run workers. Database lives in `supabase/migrations` (applied via the Supabase CLI against a local stack), with RLS enforced and verified by integration tests. The Expo app (`apps/mobile`) is scaffolded with the full Expo Router tab shell. Nested `CLAUDE.md` + `README.md` pairs document each subtree.

**Tech Stack:** TypeScript everywhere · pnpm workspaces · Supabase (Postgres 15, `pgmq`, `pg_cron`, RLS) · Supabase CLI · Vitest (core + workers + RLS integration) · Expo / React Native / Expo Router · Jest + @testing-library/react-native (mobile) · GitHub Actions CI.

---

## Plan sequence context

This is **Plan 1 of 5** for Layer 0. Later plans (own files, written when reached):

2. **Auth & Connections** — EF-mediated OAuth (Strava/Notion/Calendar), Vault token encryption, single-use session handoff, connection lifecycle.
3. **Ingestion** — `strava-webhook` EF, ingest worker, `normalize`, tiered backfill, reconciliation sweep.
4. **Sync loop** — `matcher`, `OutboundDestination` adapters (Calendar/Notion), `plan-push` worker, `revert`.
5. **Expo app** — WIRED screens (Home/Activities/Plans/Connections), Realtime, SHELL "coming soon" screens.

This plan deliberately creates **schema + skeletons + tests only** for pieces that later plans flesh out (e.g. `normalize`/`matcher` get type-level contracts and stubs here; their real logic lands in Plans 3–4).

---

## File Structure

```
logged/
├── package.json                      # root: workspace scripts, devDeps
├── pnpm-workspace.yaml               # workspace globs
├── tsconfig.base.json                # shared TS config, extended by every package
├── .github/workflows/ci.yml          # typecheck + lint + test + migration check
├── CLAUDE.md                         # root agent-binding rules (init-project-docs)
├── README.md                         # root narrative
├── docs/adr/                         # ADR records (init-project-docs scaffolds)
├── packages/
│   └── core/                         # PURE shared logic — no I/O
│       ├── package.json
│       ├── tsconfig.json
│       ├── CLAUDE.md  README.md
│       └── src/
│           ├── index.ts
│           ├── types.ts              # domain types (Activity, PlannedSession, MatchResult, …)
│           ├── normalize.ts          # stub + contract (filled in Plan 3)
│           ├── matcher.ts            # stub + contract (filled in Plan 4)
│           └── *.test.ts
├── services/
│   └── worker/                       # Cloud Run workers (ingest/sync/plan-push) — Plans 3–4
│       ├── package.json  tsconfig.json  CLAUDE.md  README.md
│       └── src/index.ts              # Hono app skeleton + /healthz
├── supabase/
│   ├── config.toml                   # supabase init
│   ├── migrations/*.sql              # schema (this plan)
│   └── tests/                        # Vitest RLS integration tests
│       ├── helpers.ts
│       └── *.test.ts
└── apps/
    └── mobile/                       # Expo app — Plan 5 wires it
        ├── package.json  app.json  tsconfig.json  CLAUDE.md  README.md
        └── app/                      # expo-router tree (tabs + screens)
```

---

## Task 1: Initialize pnpm-workspace monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`

- [ ] **Step 1: Create the workspace manifest**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "services/*"
  - "apps/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "logged",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "db:start": "supabase start",
    "db:reset": "supabase db reset"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: Create `.gitignore` and `.npmrc`**

`.gitignore`:
```
node_modules/
dist/
.expo/
.env*
!.env.example
supabase/.branches/
supabase/.temp/
coverage/
```

`.npmrc`:
```
auto-install-peers=true
```

- [ ] **Step 5: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes with no package errors; `node_modules/` created at root.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .npmrc pnpm-lock.yaml
git commit -m "chore: initialize pnpm-workspace monorepo"
```

---

## Task 2: Scaffold nested docs + author foundational ADRs

**Files:**
- Create (via skill): `CLAUDE.md`, `README.md`, `docs/adr/` scaffolding + ADR records
- Convention: every package below ships a `CLAUDE.md` + `README.md` pair from `CLAUDE.nested.template.md` / `README.template.md`

- [ ] **Step 1: Scaffold root docs + ADR system**

Invoke the `init-project-docs` skill to create the root `CLAUDE.md`, `README.md`, the layered `docs/` tree, and `docs/adr/` ADR scaffolding (template + index + ADR-0000 "record architecture decisions").

When prompted for project facts, supply: monorepo (pnpm workspaces), TypeScript, Supabase + Cloud Run hybrid, Expo mobile app, references the spec at `docs/superpowers/specs/2026-06-02-logged-layer0-design.md`.

- [ ] **Step 2: Record the spec's 10 ADRs + 3 foundation ADRs**

Use the `write-adr` skill once per decision. Each ADR states Decision + Context + Consequences. Author these with the listed decisions/rationale (no placeholders — these are the settled values):

From the spec:
1. **Mobile framework** → Expo/React Native. *Rationale: native daily-use feel, push later; one toolchain.*
2. **Backend platform** → Supabase (Postgres/Auth/Edge Functions/Realtime). *Collapses auth+DB+webhook+realtime for a solo build.*
3. **Auth model** → unified identity; Strava-OAuth-bootstrap OR email/Google+link.
4. **Async processing** → hybrid Supabase edges + `pgmq`; Cloud Run workers; DB-webhook/`pg_cron` trigger; Supavisor pooler; Cloud Scheduler `/drain`. *Chosen for the Layer 4 AI worker + no EF time limits.*
5. **Custom OAuth security** → `state` (CSRF) + PKCE-where-supported + single-use 60s session handoff; EF-mediated code exchange.
6. **Mobile OAuth redirect** → `expo-auth-session`, custom scheme `logged://`, EF-mediated, no Expo proxy.
7. **Outbound abstraction** → one `OutboundDestination` interface (apply + revert); Calendar + Notion implementations.
8. **Plan source of truth** → app owns plans, pushes out; no external read-back in L0.
9. **Backfill strategy** → free 90-day (Cloud Run service, summary payload) / pro full-history (Cloud Run Job, resumable); tier boundary value-based.
10. **Stats data capture at ingest** → `workout_type`, `zone_distribution` (approx), `athlete_zones` banked at L0.

New foundation ADRs:
11. **Monorepo & package manager** → pnpm workspaces, TypeScript throughout, pure domain logic isolated in `packages/core`. *Rationale: `matcher`/`normalize` are pure and shared by workers; isolating them makes them exhaustively unit-testable and prevents I/O creeping into domain logic.*
12. **Test tooling** → Vitest for `packages/core` + `services/worker` + RLS integration; Jest + @testing-library/react-native for `apps/mobile` (Expo default); Deno test for Edge Functions. *Rationale: match each runtime's native toolchain.*
13. **Worker HTTP framework** → Hono on Cloud Run (Node 20). *Rationale: minimal, fast cold start, Web-standard request/response.*

- [ ] **Step 3: Document the nested-docs convention in root `CLAUDE.md`**

Add a section to the root `CLAUDE.md`:

```markdown
## Documentation convention

Every package/major directory MUST contain a paired `CLAUDE.md` + `README.md`:
- `CLAUDE.md` — agent-binding rules, invariants, source-of-truth (from `CLAUDE.nested.template.md`).
- `README.md` — narrative, workflows, gotchas (from `README.template.md`).
When you add a new package, copy both templates and fill the applicable sections; delete empty ones.
Architecture decisions are recorded in `docs/adr/` via the write-adr skill.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/
git commit -m "docs: scaffold nested docs structure and record foundational ADRs"
```

---

## Task 3: Initialize Supabase + enable extensions

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/<ts>_enable_extensions.sql`

- [ ] **Step 1: Initialize the Supabase project locally**

Run: `supabase init`
Expected: creates `supabase/config.toml` and `supabase/` structure.

- [ ] **Step 2: Start the local stack**

Run: `supabase start`
Expected: prints local API URL, anon key, service_role key, DB URL. Record these for the test helper (Task 4).

- [ ] **Step 3: Create the extensions migration**

Run: `supabase migration new enable_extensions`
Then write the generated file `supabase/migrations/<ts>_enable_extensions.sql`:

```sql
-- pgmq: Postgres-native durable job queue
create extension if not exists pgmq;
-- pg_cron: schedule the drain sweeper, reconciliation, missed-plan sweep
create extension if not exists pg_cron;
-- pgcrypto: gen_random_uuid() for PKs
create extension if not exists pgcrypto;
```

- [ ] **Step 4: Apply and verify**

Run: `supabase db reset`
Expected: migration applies cleanly. Verify with:
`supabase db query "select extname from pg_extension where extname in ('pgmq','pg_cron','pgcrypto');"`
Expected: three rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/migrations/
git commit -m "feat(db): init supabase and enable pgmq/pg_cron/pgcrypto"
```

---

## Task 4: `profiles` table + RLS + RLS test harness

**Files:**
- Create: `supabase/migrations/<ts>_profiles.sql`, `supabase/tests/helpers.ts`, `supabase/tests/profiles.rls.test.ts`, `supabase/tests/vitest.config.ts`, `supabase/tests/package.json`

- [ ] **Step 1: Write the failing RLS test (+ shared helper)**

Create `supabase/tests/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Values printed by `supabase start`. Override via env in CI.
const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

/** Create a confirmed auth user via the Admin API and return a client authed AS that user. */
export async function userClient(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: "test-password-123",
  });
  if (signInErr) throw signInErr;
  return { client, userId };
}

export async function cleanupUser(userId: string): Promise<void> {
  await serviceClient().auth.admin.deleteUser(userId);
}
```

Create `supabase/tests/profiles.rls.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("profiles RLS", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("a user can read their own profile but not another's", async () => {
    const a = await userClient(`a-${Date.now()}@t.dev`); created.push(a.userId);
    const b = await userClient(`b-${Date.now()}@t.dev`); created.push(b.userId);

    // service role seeds both profiles
    const svc = serviceClient();
    await svc.from("profiles").upsert([{ id: a.userId }, { id: b.userId }]);

    const own = await a.client.from("profiles").select("id").eq("id", a.userId);
    expect(own.data).toHaveLength(1);

    const other = await a.client.from("profiles").select("id").eq("id", b.userId);
    expect(other.data).toHaveLength(0); // RLS hides B's row from A
  });
});
```

Create `supabase/tests/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["**/*.test.ts"], hookTimeout: 30000, testTimeout: 30000 } });
```

Create `supabase/tests/package.json`:

```json
{
  "name": "@logged/db-tests",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "lint": "echo no-lint" },
  "dependencies": { "@supabase/supabase-js": "^2.45.0" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

Add `supabase/tests/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["vitest/globals", "node"] } }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm install && pnpm --filter @logged/db-tests test`
Expected: FAIL — `relation "profiles" does not exist`.

- [ ] **Step 3: Write the migration**

Run: `supabase migration new profiles`
Write `supabase/migrations/<ts>_profiles.sql`:

```sql
create type backfill_status as enum ('none', 'running', 'done');
create type backfill_window as enum ('90d', 'full');
create type user_tier as enum ('free', 'pro');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  tier user_tier not null default 'free',
  backfill_status backfill_status not null default 'none',
  backfill_window backfill_window not null default '90d',
  backfill_cursor timestamptz,
  backfill_updated_at timestamptz,
  athlete_zones jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- inserts happen via service role (Admin API) during signup; no anon insert policy.
```

- [ ] **Step 4: Apply and re-run the test**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): add profiles table with RLS and RLS test harness"
```

---

## Task 5: `connections` table + RLS

**Files:**
- Create: `supabase/migrations/<ts>_connections.sql`, `supabase/tests/connections.rls.test.ts`

- [ ] **Step 1: Write the failing RLS test**

Create `supabase/tests/connections.rls.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("connections RLS", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("a user reads only their own connections", async () => {
    const a = await userClient(`ca-${Date.now()}@t.dev`); created.push(a.userId);
    const b = await userClient(`cb-${Date.now()}@t.dev`); created.push(b.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert([{ id: a.userId }, { id: b.userId }]);
    await svc.from("connections").insert([
      { user_id: a.userId, provider: "strava", external_account_id: "111", status: "active" },
      { user_id: b.userId, provider: "strava", external_account_id: "222", status: "active" },
    ]);

    const rows = await a.client.from("connections").select("external_account_id");
    expect(rows.data?.map((r) => r.external_account_id)).toEqual(["111"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @logged/db-tests test connections`
Expected: FAIL — `relation "connections" does not exist`.

- [ ] **Step 3: Write the migration**

Run: `supabase migration new connections`
Write `supabase/migrations/<ts>_connections.sql`:

```sql
create type connection_provider as enum ('strava', 'google_calendar', 'notion');
create type connection_status as enum ('pending_config', 'active', 'expired', 'revoked');

create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider connection_provider not null,
  external_account_id text,
  access_token text,        -- holds Vault-encrypted value (encryption added in Plan 2)
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  status connection_status not null default 'pending_config',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index connections_user_idx on connections (user_id);

alter table connections enable row level security;
create policy "connections_select_own" on connections
  for select using (auth.uid() = user_id);
-- writes go through Edge Functions / workers using the service role.
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): add connections table with RLS"
```

---

## Task 6: `activities` table + indexes + RLS

**Files:**
- Create: `supabase/migrations/<ts>_activities.sql`, `supabase/tests/activities.rls.test.ts`

- [ ] **Step 1: Write the failing test (RLS + dedup constraint)**

Create `supabase/tests/activities.rls.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("activities", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("enforces per-user dedup on strava_activity_id and isolates rows by RLS", async () => {
    const a = await userClient(`act-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert({ id: a.userId });

    const base = { user_id: a.userId, strava_activity_id: 9001, type: "Run",
      start_time: "2026-05-01T07:00:00Z", timezone: "UTC", distance_m: 5000, moving_time_s: 1500, elapsed_time_s: 1500 };
    const first = await svc.from("activities").insert(base);
    expect(first.error).toBeNull();
    const dup = await svc.from("activities").insert(base);
    expect(dup.error).not.toBeNull(); // unique (user_id, strava_activity_id)

    const seen = await a.client.from("activities").select("strava_activity_id");
    expect(seen.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @logged/db-tests test activities`
Expected: FAIL — `relation "activities" does not exist`.

- [ ] **Step 3: Write the migration**

Run: `supabase migration new activities`
Write `supabase/migrations/<ts>_activities.sql`:

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strava_activity_id bigint not null,
  type text not null,
  start_time timestamptz not null,
  timezone text not null,
  distance_m double precision not null,
  moving_time_s integer not null,
  elapsed_time_s integer not null,
  avg_pace_s_per_km double precision,
  avg_hr double precision,
  max_hr double precision,
  elevation_gain_m double precision,
  calories double precision,
  name text,
  workout_type integer,                 -- raw.workout_type; 1 = race
  zone_distribution jsonb,              -- {z1_seconds..z5_seconds}; approximate at L0
  raw jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, strava_activity_id)
);

create index activities_user_start_idx on activities (user_id, start_time desc);
create index activities_user_workout_idx on activities (user_id, workout_type) where workout_type is not null;

alter table activities enable row level security;
create policy "activities_select_own" on activities
  for select using (auth.uid() = user_id and deleted_at is null);
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): add activities table with dedup constraint, indexes, RLS"
```

---

## Task 7: `planned_sessions` + `outbound_records` tables + RLS

**Files:**
- Create: `supabase/migrations/<ts>_plans_and_outbound.sql`, `supabase/tests/plans.rls.test.ts`

- [ ] **Step 1: Write the failing test (FK + unique outbound constraint + RLS)**

Create `supabase/tests/plans.rls.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("planned_sessions + outbound_records", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("enforces one outbound_record per (activity, connection) and isolates plans by RLS", async () => {
    const a = await userClient(`plan-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert({ id: a.userId });

    const conn = await svc.from("connections")
      .insert({ user_id: a.userId, provider: "notion", status: "active" }).select("id").single();
    const act = await svc.from("activities").insert({
      user_id: a.userId, strava_activity_id: 7777, type: "Run",
      start_time: "2026-05-02T07:00:00Z", timezone: "UTC", distance_m: 10000, moving_time_s: 3000, elapsed_time_s: 3000,
    }).select("id").single();

    const rec = { user_id: a.userId, activity_id: act.data!.id, connection_id: conn.data!.id, action: "logged_new", status: "ok" };
    const first = await svc.from("outbound_records").insert(rec);
    expect(first.error).toBeNull();
    const dup = await svc.from("outbound_records").insert(rec);
    expect(dup.error).not.toBeNull(); // unique (activity_id, connection_id)

    await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2026-05-02", title: "Easy 10k" });
    const mine = await a.client.from("planned_sessions").select("title");
    expect(mine.data).toEqual([{ title: "Easy 10k" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @logged/db-tests test plans`
Expected: FAIL — `relation "planned_sessions" does not exist`.

- [ ] **Step 3: Write the migration**

Run: `supabase migration new plans_and_outbound`
Write `supabase/migrations/<ts>_plans_and_outbound.sql`:

```sql
create type plan_status as enum ('pending', 'completed', 'missed');
create type outbound_action as enum ('completed_plan', 'logged_new');
create type outbound_status as enum ('pending', 'ok', 'failed');

create table planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  planned_date date not null,
  target_distance_m double precision,
  title text not null,
  description text,
  status plan_status not null default 'pending',
  matched_activity_id uuid references activities (id) on delete set null,
  calendar_event_id text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planned_sessions_match_idx on planned_sessions (user_id, status, planned_date);

create table outbound_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  connection_id uuid not null references connections (id) on delete cascade,
  external_ref text,
  action outbound_action not null,
  status outbound_status not null default 'pending',
  retry_count integer not null default 0,   -- dead-letter cap = 3
  error text,
  synced_at timestamptz,
  deleted_at timestamptz,
  unique (activity_id, connection_id)
);

alter table planned_sessions enable row level security;
alter table outbound_records enable row level security;
create policy "plans_select_own" on planned_sessions for select using (auth.uid() = user_id);
create policy "plans_write_own" on planned_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);  -- users create/edit plans in-app
create policy "outbound_select_own" on outbound_records for select using (auth.uid() = user_id);
-- outbound_records are written only by workers (service role).
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): add planned_sessions and outbound_records with RLS"
```

---

## Task 8: `oauth_states` + `auth_handoffs` tables (service-role only)

**Files:**
- Create: `supabase/migrations/<ts>_oauth_tables.sql`, `supabase/tests/oauth_tables.rls.test.ts`

- [ ] **Step 1: Write the failing test (anon cannot read these tables)**

Create `supabase/tests/oauth_tables.rls.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("oauth_states / auth_handoffs are service-role only", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("an authenticated user cannot read oauth_states or auth_handoffs", async () => {
    const a = await userClient(`oauth-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("oauth_states").insert({ state: "s1", provider: "strava" });
    await svc.from("auth_handoffs").insert({ code: "c1", user_id: a.userId });

    const states = await a.client.from("oauth_states").select("state");
    expect(states.data ?? []).toHaveLength(0);   // RLS enabled, no select policy => nothing
    const handoffs = await a.client.from("auth_handoffs").select("code");
    expect(handoffs.data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @logged/db-tests test oauth_tables`
Expected: FAIL — `relation "oauth_states" does not exist`.

- [ ] **Step 3: Write the migration**

Run: `supabase migration new oauth_tables`
Write `supabase/migrations/<ts>_oauth_tables.sql`:

```sql
create table oauth_states (
  state text primary key,
  user_id uuid references auth.users (id) on delete cascade,  -- null for new-signup flows
  provider connection_provider not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create table auth_handoffs (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',  -- LOAD-BEARING: 60s, single-use
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies => only the service role (which bypasses RLS) can touch these.
alter table oauth_states enable row level security;
alter table auth_handoffs enable row level security;
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): add oauth_states and auth_handoffs (service-role only)"
```

---

## Task 9: Bootstrap `pgmq` queues

**Files:**
- Create: `supabase/migrations/<ts>_queues.sql`, `supabase/tests/queues.test.ts`

- [ ] **Step 1: Write the failing test (enqueue + read a job)**

Create `supabase/tests/queues.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { serviceClient } from "./helpers";

describe("pgmq queues", () => {
  it("ingest_queue accepts and returns a message", async () => {
    const svc = serviceClient();
    const send = await svc.rpc("pgmq_send", { queue_name: "ingest_queue", msg: { user_id: "u1", strava_activity_id: 1 } as any });
    expect(send.error).toBeNull();
    const read = await svc.rpc("pgmq_read", { queue_name: "ingest_queue", vt: 5, qty: 1 });
    expect(read.error).toBeNull();
    expect((read.data as any[]).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @logged/db-tests test queues`
Expected: FAIL — queue `ingest_queue` does not exist (or RPC missing).

- [ ] **Step 3: Write the migration**

Run: `supabase migration new queues`
Write `supabase/migrations/<ts>_queues.sql`:

```sql
select pgmq.create('ingest_queue');
select pgmq.create('sync_queue');
select pgmq.create('plan_push_queue');

-- Thin SECURITY DEFINER wrappers so the service-role API can send/read without direct pgmq schema grants.
create or replace function pgmq_send(queue_name text, msg jsonb)
returns bigint language sql security definer set search_path = pgmq, public as $$
  select pgmq.send(queue_name, msg);
$$;

create or replace function pgmq_read(queue_name text, vt integer, qty integer)
returns setof pgmq.message_record language sql security definer set search_path = pgmq, public as $$
  select * from pgmq.read(queue_name, vt, qty);
$$;
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase db reset && pnpm --filter @logged/db-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "feat(db): bootstrap pgmq queues with send/read wrappers"
```

---

## Task 10: `packages/core` — shared domain types + pure-logic skeletons

**Files:**
- Create: `packages/core/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/normalize.ts`, `src/matcher.ts`, `src/normalize.test.ts`, `src/matcher.test.ts`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Create the package manifest + tsconfig**

`packages/core/package.json`:
```json
{
  "name": "@logged/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "lint": "echo no-lint" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["vitest/globals"] }, "include": ["src"] }
```

- [ ] **Step 2: Define domain types**

`packages/core/src/types.ts`:
```ts
export type ActivityType = "Run" | "TrailRun" | "Workout" | string;

/** Normalized activity — the shape `normalize()` emits and the matcher consumes. */
export interface NormalizedActivity {
  stravaActivityId: number;
  type: ActivityType;
  startTime: string;          // ISO 8601
  timezone: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  calories: number | null;
  name: string | null;
  workoutType: number | null; // 1 = race
  zoneDistribution: ZoneDistribution | null;
}

export interface ZoneDistribution { z1_seconds: number; z2_seconds: number; z3_seconds: number; z4_seconds: number; z5_seconds: number; }

export interface PlannedSession {
  id: string;
  type: ActivityType;
  plannedDate: string;        // YYYY-MM-DD
  targetDistanceM: number | null;
  status: "pending" | "completed" | "missed";
}

export type MatchResult =
  | { action: "completed_plan"; planId: string; confidence: number }
  | { action: "logged_new" };

/** Outbound destination contract — implemented by Calendar/Notion adapters in Plan 4. */
export interface OutboundDestination {
  apply(activity: NormalizedActivity, match: MatchResult): Promise<{ externalRef: string }>;
  revert(record: { externalRef: string; action: MatchResult["action"] }): Promise<void>;
}
```

- [ ] **Step 3: Write failing tests for the skeleton contracts**

`packages/core/src/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computePaceSPerKm } from "./normalize";

describe("computePaceSPerKm", () => {
  it("returns seconds per km from distance + moving time", () => {
    expect(computePaceSPerKm(5000, 1500)).toBe(300); // 5km in 1500s => 300 s/km
  });
  it("returns null for zero distance", () => {
    expect(computePaceSPerKm(0, 1500)).toBeNull();
  });
});
```

`packages/core/src/matcher.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withinWindow } from "./matcher";

describe("withinWindow", () => {
  it("true when plan date is within ±36h of the activity start", () => {
    expect(withinWindow("2026-05-02", "2026-05-02T07:00:00Z", 36)).toBe(true);
  });
  it("false when outside the window", () => {
    expect(withinWindow("2026-05-10", "2026-05-02T07:00:00Z", 36)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @logged/core test`
Expected: FAIL — `computePaceSPerKm`/`withinWindow` not exported.

- [ ] **Step 5: Implement the minimal pure helpers (full logic lands in Plans 3–4)**

`packages/core/src/normalize.ts`:
```ts
import type { NormalizedActivity } from "./types";

/** Seconds per kilometre, or null when distance is zero. */
export function computePaceSPerKm(distanceM: number, movingTimeS: number): number | null {
  if (distanceM <= 0) return null;
  return movingTimeS / (distanceM / 1000);
}

/** Full normalize() (summary OR detail payload -> NormalizedActivity) is implemented in Plan 3. */
export function normalize(_payload: unknown): NormalizedActivity {
  throw new Error("normalize() is implemented in Plan 3 (Ingestion)");
}
```

`packages/core/src/matcher.ts`:
```ts
import type { NormalizedActivity, PlannedSession, MatchResult } from "./types";

/** True when a plan's date falls within ±hours of the activity start time. */
export function withinWindow(plannedDate: string, activityStartIso: string, hours: number): boolean {
  const planMs = new Date(`${plannedDate}T12:00:00Z`).getTime();
  const actMs = new Date(activityStartIso).getTime();
  return Math.abs(planMs - actMs) <= hours * 3600 * 1000;
}

/** Full scored matcher is implemented in Plan 4 (Sync loop). */
export function matcher(_activity: NormalizedActivity, _candidates: PlannedSession[]): MatchResult {
  throw new Error("matcher() is implemented in Plan 4 (Sync loop)");
}
```

`packages/core/src/index.ts`:
```ts
export * from "./types";
export * from "./normalize";
export * from "./matcher";
```

- [ ] **Step 6: Run to verify tests pass + typecheck**

Run: `pnpm --filter @logged/core test && pnpm --filter @logged/core typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Add the nested docs pair**

Copy `CLAUDE.nested.template.md` → `packages/core/CLAUDE.md` and `README.template.md` → `packages/core/README.md`. Fill: Purpose = "pure shared domain logic (types, normalize, matcher), zero I/O"; Invariant = "no imports of supabase/network/fs — keep this package side-effect free so it stays exhaustively unit-testable"; Commands = `pnpm --filter @logged/core test`.

- [ ] **Step 8: Commit**

```bash
git add packages/core
git commit -m "feat(core): add shared domain types and pure-logic skeletons with tests"
```

---

## Task 11: `services/worker` skeleton (Hono + /healthz)

**Files:**
- Create: `services/worker/package.json`, `tsconfig.json`, `src/index.ts`, `src/index.test.ts`, `Dockerfile`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Create the manifest + tsconfig**

`services/worker/package.json`:
```json
{
  "name": "@logged/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "lint": "echo no-lint", "dev": "tsx src/index.ts" },
  "dependencies": { "hono": "^4.6.0", "@hono/node-server": "^1.13.0", "@logged/core": "workspace:*" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0", "tsx": "^4.19.0" }
}
```

`services/worker/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["vitest/globals", "node"] }, "include": ["src"] }
```

- [ ] **Step 2: Write the failing test**

`services/worker/src/index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { app } from "./index";

describe("worker app", () => {
  it("GET /healthz returns 200 ok", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm install && pnpm --filter @logged/worker test`
Expected: FAIL — cannot import `./index` / `app` undefined.

- [ ] **Step 4: Implement the Hono skeleton**

`services/worker/src/index.ts`:
```ts
import { Hono } from "hono";

export const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

// Route stubs filled by later plans:
// POST /jobs/ingest      (Plan 3)
// POST /jobs/sync        (Plan 4)
// POST /jobs/plan-push   (Plan 4)
// POST /drain            (Plans 3-4 safety-net sweeper)

// Only start a listener outside the test runtime.
if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @logged/worker test`
Expected: PASS.

- [ ] **Step 6: Add the Dockerfile + nested docs**

`services/worker/Dockerfile`:
```dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @logged/worker... && pnpm --filter @logged/worker build || true
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@logged/worker", "dev"]
```

Copy the two templates into `services/worker/CLAUDE.md` / `README.md`. Fill: Purpose = "Cloud Run workers — ingest/sync/plan-push; pop pgmq jobs, call @logged/core"; Invariant = "workers connect to Postgres through the Supavisor pooler (port 6543, transaction mode); all external writes idempotent via outbound_records"; Commands = `pnpm --filter @logged/worker test`.

- [ ] **Step 7: Commit**

```bash
git add services/worker
git commit -m "feat(worker): add Cloud Run worker skeleton with Hono and /healthz"
```

---

## Task 12: Expo app skeleton (full tab shell)

**Files:**
- Create: `apps/mobile/package.json`, `app.json`, `tsconfig.json`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/activities.tsx`, `app/(tabs)/plans.tsx`, `app/(tabs)/progress.tsx`, `app/(tabs)/settings.tsx`, `components/ComingSoon.tsx`, `components/ComingSoon.test.tsx`, `jest.config.js`, `jest-setup.ts`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Create the Expo manifest + config**

`apps/mobile/package.json`:
```json
{
  "name": "@logged/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "echo no-lint"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "react": "18.2.0",
    "react-native": "0.74.5"
  },
  "devDependencies": {
    "@testing-library/react-native": "^12.5.0",
    "jest": "^29.7.0",
    "jest-expo": "~51.0.0",
    "react-test-renderer": "18.2.0",
    "typescript": "^5.6.0",
    "@types/react": "~18.2.0"
  }
}
```

`apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "Logged",
    "slug": "logged",
    "scheme": "logged",
    "version": "0.0.0",
    "orientation": "portrait",
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

`apps/mobile/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx", "types": ["jest", "react"] }, "include": ["app", "components", "jest-setup.ts"] }
```

- [ ] **Step 2: Configure Jest**

`apps/mobile/jest.config.js`:
```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|@react-navigation/.*))",
  ],
};
```

`apps/mobile/jest-setup.ts`:
```ts
import "@testing-library/react-native/extend-expect";
```

- [ ] **Step 3: Write the failing component test**

`apps/mobile/components/ComingSoon.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
import { ComingSoon } from "./ComingSoon";

test("renders the feature name and a coming-soon label", () => {
  render(<ComingSoon feature="Training load" />);
  expect(screen.getByText("Training load")).toBeOnTheScreen();
  expect(screen.getByText("Coming soon")).toBeOnTheScreen();
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm install && pnpm --filter @logged/mobile test`
Expected: FAIL — cannot find `./ComingSoon`.

- [ ] **Step 5: Implement the shared SHELL component**

`apps/mobile/components/ComingSoon.tsx`:
```tsx
import { View, Text, StyleSheet } from "react-native";

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>{feature}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.6 },
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @logged/mobile test`
Expected: PASS.

- [ ] **Step 7: Build the full router shell**

`apps/mobile/app/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from "expo-router";
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="activities" options={{ title: "Activities" }} />
      <Tabs.Screen name="plans" options={{ title: "Plans" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
```

`apps/mobile/app/(tabs)/index.tsx` (Home — WIRED screen wired in Plan 5; placeholder now):
```tsx
import { ComingSoon } from "../../components/ComingSoon";
export default function Home() { return <ComingSoon feature="Home" />; }
```

Create the same one-line screen for `activities.tsx`, `plans.tsx`, `progress.tsx`, `settings.tsx`, each rendering `<ComingSoon feature="..." />` with its own label ("Activities", "Plans", "Progress", "Settings"). Plan 5 replaces Home/Activities/Plans/Settings with WIRED implementations; the SHELL sub-screens (Training load, Race calendar, etc.) are added there.

- [ ] **Step 8: Verify typecheck + tests across the screens**

Run: `pnpm --filter @logged/mobile typecheck && pnpm --filter @logged/mobile test`
Expected: PASS, no type errors.

- [ ] **Step 9: Add nested docs pair**

Copy templates into `apps/mobile/CLAUDE.md` / `README.md`. Fill: Purpose = "Expo Router mobile app — tab shell, WIRED + SHELL screens"; Invariant = "every tab/screen exists from day one; SHELL screens render <ComingSoon/>, never a blank screen; OAuth uses scheme logged:// via expo-auth-session (Plan 2)"; Commands = `pnpm --filter @logged/mobile test`.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): scaffold Expo Router tab shell with ComingSoon SHELL screens"
```

---

## Task 13: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push: { branches: [main, master] }
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm -r --filter '!@logged/db-tests' test   # db tests need a live supabase; run separately below
  db-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: pnpm install --frozen-lockfile
      - name: Export local keys
        run: |
          echo "SUPABASE_URL=$(supabase status -o env | grep API_URL | cut -d= -f2)" >> $GITHUB_ENV
          echo "SUPABASE_ANON_KEY=$(supabase status -o env | grep ANON_KEY | cut -d= -f2)" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)" >> $GITHUB_ENV
      - run: pnpm --filter @logged/db-tests test
```

- [ ] **Step 2: Verify the workflow is valid YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, package tests, and supabase RLS integration tests"
```

---

## Self-Review

**Spec coverage (foundation scope):**
- Data model §3 — every table (`profiles`, `connections`, `activities`, `planned_sessions`, `outbound_records`, `oauth_states`, `auth_handoffs`) created with RLS + the key constraints (per-user dedup on activities, unique outbound per activity×destination, 60s/single-use handoff). ✓ Tasks 4–8.
- `pgmq` queues §2 — `ingest_queue`/`sync_queue`/`plan_push_queue`. ✓ Task 9.
- Pure shared logic §6/§9 — `@logged/core` with `normalize`/`matcher` contracts + tests; full logic explicitly deferred to Plans 3–4. ✓ Task 10.
- Hybrid architecture §2 — worker skeleton with Supavisor/idempotency invariants documented; real jobs in Plans 3–4. ✓ Task 11.
- UI shell §7 — full tab navigation with SHELL `<ComingSoon/>`; WIRED screens deferred to Plan 5. ✓ Task 12.
- ADRs §10 — all 10 spec ADRs + 3 foundation ADRs authored. ✓ Task 2.
- Nested docs requirement — `init-project-docs` scaffold + per-package CLAUDE.md/README pairs + convention in root CLAUDE.md. ✓ Tasks 2, 10, 11, 12.
- **Deferred by design (not gaps):** OAuth flows/Vault encryption (Plan 2), webhook/ingest/backfill (Plan 3), adapters/matcher logic/plan-push (Plan 4), WIRED screens + Realtime (Plan 5).

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step shows real content. The `normalize()`/`matcher()` bodies intentionally `throw` with a pointer to their implementing plan — this is a deliberate contract stub with passing tests for the shipped helpers, not a placeholder.

**Type consistency:** `NormalizedActivity`, `PlannedSession`, `MatchResult`, `OutboundDestination` defined once in `core/src/types.ts` and referenced consistently; helper names (`computePaceSPerKm`, `withinWindow`, `matcher`, `normalize`) match between tests and implementations. DB enum/column names match across migrations and test seeds (`connection_provider`, `plan_status`, `outbound_action`, `retry_count`, `zone_distribution`).

---

## Execution Handoff

See the parent message for execution options.
