# ADR 0007: Outbound Abstraction — OutboundDestination Interface

- Status: Accepted
- Date: 2026-06-02

## Context

Logged pushes training plans to external destinations: initially Google Calendar and Notion. Both need to be created when a plan session is scheduled, updated when it changes, and potentially removed when it is deleted or a run is un-matched. As more destinations may be added in future (e.g., Apple Calendar, Garmin Connect), the worker code must not be littered with provider-specific conditionals. Additionally, two different semantics are needed: creating a new record for a newly logged run vs. updating an existing record for a completed planned session.

## Decision

Define a single **`OutboundDestination` interface** with `apply` and `revert` methods:

- `apply(session, context)` — idempotently create or update the external record for a training session. When the session is a `completed_plan` (a planned run that was completed), this is an UPDATE to the existing external record. When it is a `logged_new` (a run with no matching plan), this is a CREATE.
- `revert(session, context)` — remove or undo the external record (e.g., if a matched run is un-matched or a plan session is deleted).

Google Calendar and Notion are concrete implementations of this interface. The worker's plan-push logic depends only on the interface, not on any specific provider.

## Consequences

- Adding a new destination requires only a new implementation of `OutboundDestination` — no changes to orchestration logic.
- The `completed_plan` vs. `logged_new` distinction is handled inside `apply`, keeping the interface simple.
- `revert` must be implemented carefully for each provider to handle idempotent deletion (e.g., a Calendar event that was already deleted externally).
- Provider credentials and API clients are injected per-implementation, keeping them out of the interface.
