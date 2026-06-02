# Subtree Instructions — services/worker

> Agent-binding rules for this subtree. Extends root `CLAUDE.md`.
> Pair file: [`./README.md`](./README.md) — narrative, workflows, gotchas.

## Purpose

Cloud Run workers (ingest/sync/plan-push) — pop pgmq jobs, call @logged/core, write results.

This subtree is responsible for:
- Receiving HTTP POST triggers from DB webhooks or pg_cron
- Popping jobs from pgmq queues and processing them
- Calling `@logged/core` for pure business logic (scheduling, conflict detection, diff computation)
- Writing idempotent results to `outbound_records`

---

## Out of scope

This subtree does NOT own:
- Database schema (owned by `supabase/`)
- Core domain types and pure logic (owned by `packages/core`)
- Frontend or API gateway routing

---

## Invariants (must not be broken)

### Networking
- Workers connect to Postgres through the Supavisor pooler (port 6543, transaction mode)

### Data integrity
- All external writes are idempotent via `outbound_records`
- OAuth tokens are refreshed refresh-on-use before each external call

---

## Component relationships

- `app` ([`src/index.ts`](./src/index.ts))
  - Exports: Hono app instance (also used by test harness)
  - Reads from: pgmq queues (Postgres)
  - Writes to: `outbound_records` (Postgres)
  - Used by: Cloud Run HTTP trigger, Vitest test suite

---

## Entry points

- Primary entry: [`src/index.ts`](./src/index.ts)
- Route stubs for job handlers are filled in Plans 3-4 (`/jobs/ingest`, `/jobs/sync`, `/jobs/plan-push`, `/drain`)

---

## Data flow (summary)

Job processing flow:
1. DB webhook or pg_cron fires a POST to the worker endpoint
2. Worker pops a job from the relevant pgmq queue
3. Worker calls `@logged/core` pure logic functions
4. Worker writes idempotent result to `outbound_records`
5. Worker ACKs the pgmq message

---

## Library / tooling rules

- Use:
  - Hono for all HTTP routing — do not use Express, Fastify, or any other HTTP framework
  - `@hono/node-server` for the Node.js listener (production only, not in tests)
  - `@logged/core` for all domain logic — keep worker handlers thin
- Do not use:
  - Direct database writes that bypass `outbound_records` for external state
  - Mutable shared state across requests

---

## Key patterns to follow

- Export `app` from `src/index.ts` so tests can call `app.request(...)` without starting a listener
- Guard the `serve(...)` call with `process.env.NODE_ENV !== "test" && process.env.VITEST !== "true"` to prevent listener startup during tests
- Job routes (`/jobs/*`, `/drain`) are stubs until Plans 3-4 — add them there, not here

---

## Anti-patterns to avoid

- Do not start the HTTP listener during tests — the `app.request()` helper on the Hono app handles routing in-process
- Do not implement job routes ahead of their planned milestones (YAGNI)
- Do not write directly to external APIs without going through `outbound_records`

---

## Commands

Commands the agent must run as part of its work in this subtree.

- Tests: `pnpm --filter @logged/worker test`
- Typecheck: `pnpm --filter @logged/worker typecheck`
- Lint: `pnpm --filter @logged/worker lint`

Broader workflows (dev setup, debugging, deploy) live in [`./README.md`](./README.md).
