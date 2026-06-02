# ADR 0008: Plan Source of Truth — App-Owned, Push-Only

- Status: Accepted
- Date: 2026-06-02

## Context

Training plans can be created in Logged and pushed to Google Calendar and Notion for visibility. Alternatively, the app could treat Calendar or Notion as the source of truth and sync changes back. Bidirectional sync is significantly more complex: it requires conflict resolution, change detection in external systems (polling or webhooks from both Calendar and Notion), and handling of concurrent edits. For Layer 0, the complexity is not justified.

## Decision

**The Logged app owns all training plans.** External destinations (Google Calendar, Notion) are **write targets only** in Layer 0.

- Plans are created, edited, and deleted exclusively within Logged.
- On create/edit, Logged pushes the update to connected destinations via the `OutboundDestination` interface (ADR 0007).
- Logged never reads plans back from Calendar or Notion to reconcile state.
- Importing existing external plans (e.g., a training plan already in Calendar) is a **deferred future feature**.

## Consequences

- Plan logic is simple: the DB is always authoritative; pushes are best-effort fire-and-forget (with retry via the pgmq queue).
- External edits to Calendar events or Notion pages are silently overwritten on the next Logged push. Users must be warned of this in the UI.
- The architecture remains push-only until a future ADR explicitly decides to add read-back or bidirectional sync.
- Deferring import reduces Layer 0 scope significantly, enabling a faster initial ship.
