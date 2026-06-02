# ADR 0002: Backend Platform — Supabase

- Status: Accepted
- Date: 2026-06-02

## Context

Logged needs: a relational database with row-level security, user auth (email, Google, and Strava OAuth), HTTPS endpoints for OAuth callbacks and Strava webhooks, realtime push to the mobile client, and a durable message queue for async work. Building and operating each of these separately as a solo developer would be prohibitively expensive in time and cognitive load.

## Decision

Use **Supabase** as the primary backend platform, leveraging:

- **Postgres** — relational data store with RLS policies
- **Auth** — user identity, OAuth session management
- **Edge Functions** (Deno) — OAuth callbacks, Strava webhook receiver, queue enqueue
- **Realtime** — push activity-sync status and plan updates to the mobile client
- **pgmq** — durable Postgres-native message queue for async work items

## Consequences

- Auth, DB, webhook endpoints, and realtime are collapsed into one platform with a single billing account and one local dev command (`supabase start`).
- RLS enforces data isolation at the DB layer, reducing the risk of accidental data leaks in application code.
- Edge Functions run on Deno, requiring a separate test toolchain (Deno test) from the rest of the TypeScript codebase.
- Edge Functions have time limits (~150s wall clock in hosted), which is why long-running work (backfill, ingest) is offloaded to Cloud Run workers — see ADR 0004.
- Supabase's hosted free tier is sufficient for early user counts; scaling to pro is straightforward.
