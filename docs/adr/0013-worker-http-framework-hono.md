# ADR 0013: Worker HTTP Framework — Hono on Cloud Run

- Status: Accepted
- Date: 2026-06-02

## Context

The Cloud Run worker needs a lightweight HTTP server to expose endpoints (`/ingest`, `/sync`, `/backfill`, `/drain`) that are called by Supabase Database Webhooks, `pg_cron net.http_post`, and Cloud Scheduler. Cold starts matter because Cloud Run scales to zero between invocations. The framework must be easy to unit-test without spinning up a real HTTP server, and must not impose unnecessary overhead.

## Decision

Use **Hono** as the HTTP framework for `services/worker`, running on **Node 20+** in Cloud Run.

Hono is chosen for:

- **Minimal footprint** — fast cold start, small bundle size.
- **Web-standard `Request`/`Response`** — handlers are testable with `app.request()` in unit tests, no HTTP server required.
- **TypeScript-first** — typed middleware, route handlers, and context.
- **Node adapter** — `@hono/node-server` wraps Hono for Node's `http` module with no custom glue code.

## Consequences

- Worker route handlers can be unit-tested with `const res = await app.request('/ingest', { method: 'POST', body: ... })` — no supertest or HTTP server needed.
- Cold start time remains low because Hono's runtime overhead is minimal.
- Hono's middleware model (JWT verification, CORS, error handling) is composable and standard.
- If the worker is ever ported to a Deno Deploy or edge runtime, Hono's Web-standard API makes the transition straightforward with only the adapter changing.
