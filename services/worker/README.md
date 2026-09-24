# services/worker

> Narrative and human-facing context for this folder.
> Pair file: [`./CLAUDE.md`](./CLAUDE.md) — agent-binding rules, invariants, source-of-truth.

## Purpose

This folder is responsible for:
- Running Cloud Run workers that process background jobs for the Logged platform
- Handling ingest, sync, and plan-push jobs triggered by DB webhooks or pg_cron
- Popping jobs from pgmq queues, invoking `@logged/core` logic, and writing results to `outbound_records`

This folder is not responsible for:
- Database schema definitions (owned by `supabase/`)
- Core domain types and business logic (owned by `packages/core`)
- User-facing API or frontend

---

## Where this fits

Parent context:
- [Project README](../../README.md)

The worker sits between the database (pgmq queues) and external services (calendar APIs, etc.). It is the only process that writes to `outbound_records` for external state changes.

---

## How it's triggered

Workers receive HTTP POST requests from two sources:

1. **DB webhooks** — Supabase Database Webhooks fire when a new job is inserted into a pgmq queue table, triggering the relevant POST endpoint on the Cloud Run worker.
2. **pg_cron** — Scheduled Postgres jobs call the worker's `/drain` endpoint on a regular cadence as a safety-net sweeper to pick up any jobs missed by webhooks.

The `/healthz` endpoint is used by Cloud Run for liveness/readiness checks.

---

## Important files and folders

```txt
services/worker/
├── src/
│   ├── index.ts        — Hono app, /healthz route, conditional HTTP listener
│   └── index.test.ts   — Vitest tests for the Hono app
├── Dockerfile          — Cloud Run container image
├── package.json
├── tsconfig.json
├── CLAUDE.md           — Agent-binding rules
└── README.md           — This file
```

---

## Local conventions

- The Hono `app` is exported from `src/index.ts` for direct use in tests (`app.request(...)`)
- The HTTP listener (`@hono/node-server`) only starts when `NODE_ENV !== "test"` and `VITEST !== "true"`
- Job route handlers (`/jobs/ingest`, `/jobs/sync`, `/jobs/plan-push`, `/drain`) are stubs — they will be filled in Plans 3 and 4

Agent-binding conventions (must-use libraries, testing rules) live in `./CLAUDE.md`.

---

## Common workflows

```bash
# Run tests
pnpm --filter @logged/worker test

# Typecheck
pnpm --filter @logged/worker typecheck

# Run locally in dev mode (starts HTTP listener on port 8080)
pnpm --filter @logged/worker dev

# Build the Docker image
docker build -t logged-worker services/worker/
```

---

## Gotchas

- The top-level `await import("@hono/node-server")` in `src/index.ts` requires ESM (`"type": "module"` in package.json) and an ES2022+ TypeScript target — both are satisfied by the base tsconfig.
- Do not run `pnpm --filter @logged/worker dev` during tests — the listener guard checks `VITEST=true` which Vitest sets automatically.
- Worker connects to Postgres via Supavisor pooler on port 6543 (transaction mode), not the direct Postgres port 5432.
- `createClient` (and thus `Db`) must pass `realtime: { transport: ws }` (the `ws` package). `@supabase/realtime-js`'s Phoenix socket falls back to `global.WebSocket` when no transport is given, which doesn't exist on Node < 22 (our CI and Cloud Run both run Node 20) — without this, any code path that connects the realtime client throws "Node.js 20 detected without native WebSocket support." Passing `transport` explicitly always wins over the native/`global.WebSocket` fallback, so this is safe on any Node version.

---

## Documentation maintenance

Update this README when changes affect:
- the worker's job routes or processing logic
- trigger mechanism (webhooks vs pg_cron schedule)
- public interfaces/contracts with `@logged/core`
- commands/workflows
- Docker image or deployment configuration
- recurring gotchas
