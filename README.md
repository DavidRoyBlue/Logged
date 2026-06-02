# Logged

> Pair file: [`./CLAUDE.md`](./CLAUDE.md) — agent-binding rules and invariants.

Logged is a mobile running app that automatically syncs your Strava activities, manages app-owned training plans, and pushes those plans to Google Calendar and Notion. When a run comes in from Strava, Logged matches it to the nearest planned session and marks it complete.

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────┐
│  Expo / React Native (apps/mobile)                      │
│  Expo Router · React Query · Supabase Realtime          │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS + Realtime WS
┌─────────────────────────▼───────────────────────────────┐
│  Supabase                                               │
│  ├─ Postgres (pgmq queues, RLS, pg_cron)               │
│  ├─ Auth (unified identity + OAuth connections)        │
│  ├─ Edge Functions (OAuth callbacks, webhooks)         │
│  └─ Realtime (activity sync status, plan updates)      │
└─────────────────────────┬───────────────────────────────┘
                          │ Database Webhook / pg_cron net.http_post
┌─────────────────────────▼───────────────────────────────┐
│  Cloud Run Workers (services/worker)                    │
│  Hono · Node 20+                                       │
│  ├─ /ingest   — process queued Strava activities       │
│  ├─ /sync     — keep Strava token fresh                │
│  ├─ /backfill — historical activity import             │
│  └─ /drain    — Cloud Scheduler safety net             │
└─────────────────────────────────────────────────────────┘
```

**Supabase** is the system of record: Postgres stores all data, Auth manages identities, Edge Functions handle OAuth and Strava webhooks. **Cloud Run workers** handle anything that exceeds Edge Function time limits — primarily Strava ingest, backfill, and (in future layers) AI coaching. **Expo** provides the native mobile shell with Realtime-powered live updates.

---

## Repo layout

```
logged/
├── packages/
│   └── core/           # Pure TypeScript domain logic (matchers, normalizers, types)
├── services/
│   └── worker/         # Cloud Run worker (Hono, Node 20+)
├── apps/
│   └── mobile/         # Expo / React Native app
├── supabase/
│   ├── migrations/     # Postgres migrations
│   ├── functions/      # Edge Functions (Deno)
│   └── seed.sql        # Local dev seed data
├── docs/
│   ├── adr/            # Architecture Decision Records
│   └── superpowers/    # Specs and implementation plans
├── CLAUDE.md           # Agent-binding rules (root)
├── CLAUDE.nested.template.md  # Template for per-subtree CLAUDE.md
├── README.template.md         # Template for per-subtree README.md
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Getting started

### Prerequisites

- **Node 24+** (or use [nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm))
- **pnpm 10.15+** — `npm install -g pnpm`
- **Docker Desktop** (for local Supabase stack)
- **Supabase CLI** — installed via `pnpm exec supabase` (workspace devDep)

### Setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Start the local Supabase stack (Postgres, Auth, Edge Functions, Studio)
pnpm exec supabase start

# 4. Apply migrations and seed data
pnpm exec supabase db push

# 5. Run all tests
pnpm test

# 6. Type-check all packages
pnpm typecheck
```

Supabase Studio is available at `http://127.0.0.1:54323` after `supabase start`.

### Stopping local infra

```bash
pnpm exec supabase stop
```

---

## Documentation

| Resource | Location |
|----------|----------|
| Design spec (Layer 0) | [`docs/superpowers/specs/2026-06-02-logged-layer0-design.md`](docs/superpowers/specs/2026-06-02-logged-layer0-design.md) |
| Architecture Decision Records | [`docs/adr/`](docs/adr/README.md) |
| Agent-binding rules | [`CLAUDE.md`](CLAUDE.md) |
| Per-subtree doc templates | `CLAUDE.nested.template.md`, `README.template.md` |

---

## Key decisions

All durable architecture decisions are recorded as ADRs in [`docs/adr/`](docs/adr/README.md). Highlights:

- Mobile: Expo/React Native (ADR 0001)
- Backend platform: Supabase (ADR 0002)
- Auth model: unified identity with `connections` rows (ADR 0003)
- Async processing: pgmq + Cloud Run workers (ADR 0004)
- Monorepo: pnpm workspaces + `packages/core` isolation (ADR 0011)
