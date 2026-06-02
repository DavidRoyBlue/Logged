# ADR 0004: Async Processing — pgmq + Cloud Run Workers

- Status: Accepted
- Date: 2026-06-02

## Context

Strava activity ingest, plan-push to external destinations, and especially historical backfill can take seconds to minutes — well beyond Edge Function time limits. We need a durable, observable async processing pipeline that can handle backfill of years of Strava data and, in Layer 4, feed an AI coaching worker. We also need a connection strategy that lets Cloud Run workers safely access the Supabase Postgres database under connection-count constraints.

## Decision

Use a **hybrid async architecture**:

- **pgmq** (Postgres-native message queue via Supabase extension) for durable work queues.
- **Supabase Edge Functions** enqueue work items when a Strava webhook fires or a user action triggers async work.
- **Cloud Run workers** (Hono, Node 20+) dequeue and process work. Workers are triggered by:
  - Supabase Database Webhook (immediate, event-driven)
  - `pg_cron` + `net.http_post` (scheduled polling)
  - Cloud Scheduler hitting `/drain` as a safety net for any missed triggers
- Workers connect back to Postgres via **Supavisor pooler at port 6543 in transaction mode** to avoid exhausting connection slots.

## Consequences

- Long-running work (backfill, future AI processing) is not constrained by Edge Function time limits.
- pgmq provides at-least-once delivery with visibility timeouts and dead-letter support.
- Cloud Scheduler `/drain` ensures queue liveness even if webhook delivery fails.
- Workers must use Supavisor (port 6543, transaction mode) — not direct Postgres (port 5432) — to stay within connection limits. This is a load-bearing invariant.
- This architecture scales naturally to the Layer 4 AI worker without redesign.
