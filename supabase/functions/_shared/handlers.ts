/**
 * handlers.ts — Factored, dependency-injected OAuth handlers.
 *
 * All handlers receive a `HandlerDeps` struct containing the Supabase client,
 * fetch implementation, and environment accessor. This makes every handler
 * unit-testable without Deno.serve or live provider calls.
 *
 * Return shape: { status, body?, redirect? }
 */

import { PROVIDERS } from "./providers.ts";
import {
  pkcePair,
  buildAuthorizeUrl,
  exchangeCode,
} from "./oauth.ts";

// ---------------------------------------------------------------------------
// Dependency interfaces
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type AnyData = any;

export interface SupabaseLike {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: AnyData; error: AnyData }>;

  /** Create a new Auth user and return its id. */
  adminCreateUser(email: string): Promise<{ userId: string }>;

  /** Mint a session token for the given user id. */
  mintSession(userId: string): Promise<{ access_token: string; refresh_token: string }>;
}

/** Simple env accessor — mirrors Deno.env.get signature. */
export type Env = (key: string) => string | undefined;

export interface HandlerDeps {
  db: SupabaseLike;
  fetchImpl: typeof fetch;
  env: Env;
  /** Deep-link / custom-scheme prefix e.g. "logged://oauth/callback" */
  appRedirectScheme: string;
}

// ---------------------------------------------------------------------------
// HandlerResult
// ---------------------------------------------------------------------------

export interface HandlerResult {
  status: number;
  body?: unknown;
  redirect?: string;
}

// ---------------------------------------------------------------------------
// handleAuthorize
// ---------------------------------------------------------------------------

/**
 * Generates OAuth state (+ PKCE pair if provider.usesPkce), persists both via
 * `create_oauth_state`, then returns a 302 redirect to the provider's consent URL.
 *
 * @param provider  One of "strava" | "google_calendar" | "notion"
 * @param userId    Auth user id (null for Strava sign-up flows; linked flows pass the user)
 * @param deps      Injected dependencies
 */
export async function handleAuthorize(
  provider: string,
  userId: string | null,
  deps: HandlerDeps
): Promise<HandlerResult> {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { status: 400, body: { error: `Unknown provider: ${provider}` } };

  const ucProvider = provider.toUpperCase().replace(/-/g, "_");
  const clientId = deps.env(`${ucProvider}_CLIENT_ID`) ?? "";
  const redirectUri = deps.env(`${ucProvider}_REDIRECT_URI`) ?? "";

  // Generate PKCE pair for providers that use it
  let verifier: string | null = null;
  let challenge: string | undefined;
  if (cfg.usesPkce) {
    const pair = await pkcePair();
    verifier = pair.verifier;
    challenge = pair.challenge;
  }

  // Persist state (and verifier if PKCE) via DB RPC
  const { data: state, error } = await deps.db.rpc("create_oauth_state", {
    p_provider: provider,
    p_user_id: userId,
    p_code_verifier: verifier ?? null,
  });

  if (error) {
    return { status: 500, body: { error: "Failed to create OAuth state" } };
  }

  const redirectUrl = buildAuthorizeUrl(cfg, {
    clientId,
    redirectUri,
    state: state as string,
    challenge,
  });

  return { status: 302, redirect: redirectUrl };
}

// ---------------------------------------------------------------------------
// handleStravaCallback
// ---------------------------------------------------------------------------

/**
 * Handles the Strava OAuth callback.
 *
 * Flow:
 * 1. Consume state from DB (400 if expired/not found)
 * 2. Exchange code for tokens (no PKCE verifier — Strava doesn't use PKCE)
 * 3. Extract athlete id from token payload
 * 4. find_strava_connection(athleteId) → if found, reuse userId; else adminCreateUser
 * 5. attach_connection (upsert)
 * 6. create_auth_handoff → code
 * 7. Redirect to appRedirectScheme?code=<handoff code>
 */
export async function handleStravaCallback(
  params: { state: string; code: string },
  deps: HandlerDeps
): Promise<HandlerResult> {
  // 1. Consume oauth state
  const { data: stateRows, error: stateErr } = await deps.db.rpc("consume_oauth_state", {
    p_state: params.state,
  });

  if (stateErr || !Array.isArray(stateRows) || stateRows.length === 0) {
    return { status: 400, body: { error: "Invalid or expired OAuth state" } };
  }

  const stateRow = stateRows[0];

  // 2. Exchange code for tokens (Strava does NOT use PKCE)
  const clientId = deps.env("STRAVA_CLIENT_ID") ?? "";
  const clientSecret = deps.env("STRAVA_CLIENT_SECRET") ?? "";
  const redirectUri = deps.env("STRAVA_REDIRECT_URI") ?? "";

  const tokens = await exchangeCode(
    PROVIDERS.strava,
    { clientId, clientSecret, redirectUri, code: params.code },
    deps.fetchImpl
  );

  // 3. Extract athlete id from token raw response
  // deno-lint-ignore no-explicit-any
  const raw = tokens.raw as any;
  const athleteId = String(raw?.athlete?.id ?? "");
  if (!athleteId) {
    return { status: 400, body: { error: "No athlete id in token response" } };
  }

  // 4. Find or create user
  let userId: string;

  const { data: connRows } = await deps.db.rpc("find_strava_connection", {
    p_athlete_id: athleteId,
  });

  if (Array.isArray(connRows) && connRows.length > 0) {
    // Existing athlete — reuse the existing user
    userId = connRows[0].user_id as string;
  } else {
    // New athlete — provision a new auth user
    const syntheticEmail = `strava+${athleteId}@logged.internal`;
    const created = await deps.db.adminCreateUser(syntheticEmail);
    userId = created.userId;
  }

  // 5. Attach (upsert) the connection
  await deps.db.rpc("attach_connection", {
    p_user_id: userId,
    p_provider: "strava",
    p_external_account_id: athleteId,
    p_access: tokens.accessToken,
    p_refresh: tokens.refreshToken ?? "",
    p_expires: tokens.expiresAt ?? null,
    p_scopes: PROVIDERS.strava.scope,
    p_status: "active",
    p_config: {},
  });

  // 6. Create auth handoff
  const { data: handoffCode } = await deps.db.rpc("create_auth_handoff", {
    p_user_id: userId,
  });

  // 7. Redirect to app deep-link
  return {
    status: 302,
    redirect: `${deps.appRedirectScheme}?code=${handoffCode}`,
  };
}

// ---------------------------------------------------------------------------
// handleLinkedCallback
// ---------------------------------------------------------------------------

/**
 * Handles OAuth callbacks for linked (non-Strava) providers: google_calendar, notion.
 *
 * This is a "linking" flow — a logged-in user is connecting a third-party service.
 * The state MUST contain a `user_id` (set at authorize time); if absent → 400.
 *
 * Flow:
 * 1. Consume state → must have user_id
 * 2. Exchange code WITH the stored PKCE verifier
 * 3. attach_connection(..., 'pending_config', {})
 * 4. Redirect to appRedirectScheme?provider=<provider>&status=pending_config
 */
export async function handleLinkedCallback(
  provider: string,
  params: { state: string; code: string },
  deps: HandlerDeps
): Promise<HandlerResult> {
  // 1. Consume oauth state
  const { data: stateRows, error: stateErr } = await deps.db.rpc("consume_oauth_state", {
    p_state: params.state,
  });

  if (stateErr || !Array.isArray(stateRows) || stateRows.length === 0) {
    return { status: 400, body: { error: "Invalid or expired OAuth state" } };
  }

  const stateRow = stateRows[0];
  const userId = stateRow.user_id as string | null;
  const codeVerifier = stateRow.code_verifier as string | null;

  if (!userId) {
    return { status: 400, body: { error: "No user_id in OAuth state — must be a linking flow" } };
  }

  const cfg = PROVIDERS[provider];
  if (!cfg) return { status: 400, body: { error: `Unknown provider: ${provider}` } };

  const ucProvider = provider.toUpperCase().replace(/-/g, "_");
  const clientId = deps.env(`${ucProvider}_CLIENT_ID`) ?? "";
  const clientSecret = deps.env(`${ucProvider}_CLIENT_SECRET`) ?? "";
  const redirectUri = deps.env(`${ucProvider}_REDIRECT_URI`) ?? "";

  // 2. Exchange code — include PKCE verifier if present
  const tokens = await exchangeCode(
    cfg,
    {
      clientId,
      clientSecret,
      redirectUri,
      code: params.code,
      verifier: codeVerifier ?? undefined,
    },
    deps.fetchImpl
  );

  // 3. Determine an external account id (provider-specific, may be null)
  // deno-lint-ignore no-explicit-any
  const raw = tokens.raw as any;
  let externalAccountId: string | null = null;
  if (provider === "google_calendar") {
    // Google doesn't put the account id in the token; we'll leave it null here.
    // The worker that syncs calendar events can fill it in later.
    externalAccountId = null;
  } else if (provider === "notion") {
    // Notion returns workspace_id / bot_id; use workspace_id as the account ref.
    externalAccountId = raw?.workspace_id ?? null;
  }

  // 4. Attach connection as pending_config
  await deps.db.rpc("attach_connection", {
    p_user_id: userId,
    p_provider: provider,
    p_external_account_id: externalAccountId,
    p_access: tokens.accessToken,
    p_refresh: tokens.refreshToken ?? "",
    p_expires: tokens.expiresAt ?? null,
    p_scopes: tokens.raw
      // deno-lint-ignore no-explicit-any
      ? ((tokens.raw as any).scope ?? cfg.scope)
      : cfg.scope,
    p_status: "pending_config",
    p_config: {},
  });

  return {
    status: 302,
    redirect: `${deps.appRedirectScheme}?provider=${provider}&status=pending_config`,
  };
}

// ---------------------------------------------------------------------------
// handleSessionExchange
// ---------------------------------------------------------------------------

/**
 * Exchanges a one-time auth handoff code for a Supabase session.
 *
 * 1. consume_auth_handoff(code) → userId or null
 * 2. If null → 401
 * 3. mintSession(userId) → { access_token, refresh_token }
 * 4. Return 200 with session body
 */
export async function handleSessionExchange(
  code: string,
  deps: HandlerDeps
): Promise<HandlerResult> {
  const { data: userId } = await deps.db.rpc("consume_auth_handoff", {
    p_code: code,
  });

  if (!userId) {
    return { status: 401, body: { error: "Invalid or expired handoff code" } };
  }

  const session = await deps.db.mintSession(userId as string);

  return { status: 200, body: session };
}
