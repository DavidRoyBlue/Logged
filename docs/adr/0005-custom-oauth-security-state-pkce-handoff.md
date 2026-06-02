# ADR 0005: Custom OAuth Security — State + PKCE + Single-Use Handoff

- Status: Accepted
- Date: 2026-06-02

## Context

Logged implements custom OAuth flows (Strava, Google) mediated by Supabase Edge Functions, so that client secrets never leave the server. The mobile app initiates OAuth and must receive the result securely. Standard browser-based OAuth flows are vulnerable to CSRF and authorization code interception; mobile deep-link flows add additional redirect surface. We need a layered security model covering the full flow from initiation to session delivery.

## Decision

Apply three security layers to every OAuth flow:

1. **State parameter (CSRF nonce)**: a cryptographically random `state` value is generated at flow initiation and stored in an `oauth_states` table. The Edge Function verifies the returned `state` before proceeding. Single-use: the row is deleted on verification.
2. **PKCE** (Proof Key for Code Exchange): used where the provider supports it (Notion/Google; Strava does not). The code verifier is generated client-side; the code challenge is sent with the authorization request; the verifier is sent with the token exchange. Client secrets are only used in the Edge Function code exchange — never on the client.
3. **Single-use 60-second session handoff** (`auth_handoffs` table): after the Edge Function completes the token exchange and creates/updates the Supabase session, it stores an opaque one-time token in `auth_handoffs` with a 60-second TTL. The mobile app redeems this token via a separate Edge Function call to receive its session. The token is deleted on first use.

The **60-second TTL and single-use** properties of `auth_handoffs` are load-bearing invariants — relaxing either creates a replay-attack window.

## Consequences

- Client secrets remain exclusively server-side (Edge Functions).
- CSRF is mitigated by the state nonce for all providers; code interception is mitigated by PKCE for PKCE-supporting providers.
- The handoff token window is short and non-replayable, limiting the blast radius of a compromised deep link.
- Two extra DB tables (`oauth_states`, `auth_handoffs`) are required, both with TTL-based cleanup (via `pg_cron`).
- The complexity of the OAuth implementation is higher than a simple redirect, but the security properties are required for a production app handling Strava access tokens.
