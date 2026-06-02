# ADR 0003: Auth Model — Unified Identity with Connections

- Status: Accepted
- Date: 2026-06-02

## Context

Logged uses Strava as a data source but must not require Strava as the only auth mechanism. A user may want to sign up with email or Google and connect Strava later, or a future user might connect multiple external services (Garmin, etc.). The auth model must support multiple external accounts attached to a single app identity, without fragmenting user data across separate user records.

## Decision

Adopt a **unified identity model**:

- Every user has exactly one `auth.users` row (managed by Supabase Auth).
- Sign-up can happen via Strava OAuth (which bootstraps the account) or via email / Google sign-in.
- External service accounts (Strava, and future providers) are stored as rows in a `connections` table, keyed to the single `auth.users` identity.
- Strava OAuth can be linked to an existing account post-sign-up; the Edge Function checks for an existing identity before creating a new one.

## Consequences

- User data (plans, matched runs, stats) is always scoped to one stable identity regardless of which external accounts are connected.
- Linking Strava to an existing account requires matching on Strava athlete ID in the Edge Function — a small amount of custom logic.
- Future external providers (Garmin, Wahoo) follow the same `connections` pattern with no schema change.
- Unlinking an external account sets `status='revoked'` on the `connections` row (soft delete — preserves history and stored activities); re-linking flips the status back to `active` and re-runs OAuth. This is not a hard `DELETE` and not an upsert (which could duplicate rows).
