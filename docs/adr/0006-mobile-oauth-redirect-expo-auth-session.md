# ADR 0006: Mobile OAuth Redirect — expo-auth-session + Custom Scheme

- Status: Accepted
- Date: 2026-06-02

## Context

The Expo mobile app must initiate OAuth flows (Strava, Google) and receive the result as a deep link. Expo offers `expo-auth-session` with an optional proxy (`auth.expo.io`) for development convenience, but the proxy introduces a dependency on Expo infrastructure and cannot be used in production without it. The OAuth provider's redirect URI must point somewhere that can hand the authorization code to a server (to keep the client secret server-side), and then redirect back to the app.

## Decision

Use **`expo-auth-session`** with **`WebBrowser.openAuthSessionAsync`** and the **custom URI scheme `logged://`**, without the Expo proxy.

The flow is:

1. The app opens the OAuth provider's authorization URL (constructed in the Edge Function or client, with `state` and PKCE challenge).
2. The provider's `redirect_uri` points at the **Supabase Edge Function** (HTTPS), which receives the authorization code server-side.
3. The Edge Function completes the code exchange (keeping the client secret server-side), then issues an HTTP 302 redirect to `logged://oauth/callback?code=<token>`.
4. iOS/Android intercepts the deep link, and `WebBrowser.openAuthSessionAsync` resolves with the result URL.
5. The app redeems the handoff token via a separate Edge Function call (see ADR 0005).

## Consequences

- No Expo proxy dependency — the flow works identically in development and production.
- The `redirect_uri` registered with each OAuth provider must be the Supabase Edge Function URL (HTTPS), not `logged://` directly. This means provider configuration must be updated if the Edge Function URL changes.
- `logged://` must be registered in `app.json` scheme config and with each OAuth provider as an allowed scheme.
- `WebBrowser.openAuthSessionAsync` handles the in-app browser session on both iOS and Android without requiring a separate browser app.
