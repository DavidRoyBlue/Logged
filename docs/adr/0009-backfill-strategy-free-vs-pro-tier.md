# ADR 0009: Backfill Strategy — Free 90-Day vs Pro Full History

- Status: Accepted
- Date: 2026-06-02

## Context

When a user connects Strava, Logged should import their historical activities so the matching and stats features are immediately useful. Strava's API allows fetching the full history, but a full historical backfill of a multi-year athlete could involve hundreds of API calls. There is a natural question of whether to offer full history to all users or gate it behind a paid tier — and if gating, on what grounds.

## Decision

Implement a **two-tier backfill strategy**:

- **Free tier**: 90-day window backfill via a **Cloud Run service** (single invocation, summary payload only — no HR streams). Fast, bounded, sufficient for near-term matching.
- **Pro tier**: full history backfill via a **Cloud Run Job** (batch processing, checkpoint-resumable via a `backfill_cursor` column). Can be interrupted and resumed without re-fetching already-processed activities.

The tier boundary is **value-based**: AI coaching (a planned pro feature) requires 12+ months of history to generate meaningful training load models. The constraint is not primarily compute cost — it is that the feature requiring the data is a pro feature.

## Consequences

- The free-tier backfill is simple (single Cloud Run service invocation, no checkpointing needed).
- The pro-tier Cloud Run Job must implement checkpoint logic via `backfill_cursor` to handle preemption and API rate limits across potentially thousands of activities.
- Summary payload only at Layer 0 means HR streams (needed for exact zone distribution) are not fetched during backfill — see ADR 0010. Streams can be fetched in a later layer.
- The tier gating must be enforced in the Edge Function or worker that initiates backfill, not assumed by the job itself.
