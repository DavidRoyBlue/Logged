/**
 * handlers.test.ts — deno test suite for the factored OAuth handlers.
 *
 * Uses fakes for SupabaseLike, fetch, and env so no live network is needed.
 */

import {
  assertEquals,
  assertMatch,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleAuthorize,
  handleStravaCallback,
  handleLinkedCallback,
  handleSessionExchange,
  type HandlerDeps,
  type SupabaseLike,
} from "./handlers.ts";

// ---------------------------------------------------------------------------
// Fake SupabaseLike
// ---------------------------------------------------------------------------

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

type RpcCannedData =
  | null
  | string
  | Array<Record<string, unknown>>
  | Record<string, unknown>;

/**
 * A configurable fake that records every rpc() call and returns canned data.
 */
class FakeSupabase implements SupabaseLike {
  calls: RpcCall[] = [];
  private canned: Map<string, () => { data: RpcCannedData; error: null | { message: string } }> =
    new Map();
  private createdUserId = "fake-created-user-id";
  public adminCreateUserCalled = false;
  public mintSessionCalled = false;
  public mintedForUserId: string | null = null;

  /** Set the return value for a given rpc function name. */
  setCanned(
    fn: string,
    factory: () => { data: RpcCannedData; error: null | { message: string } }
  ): void {
    this.canned.set(fn, factory);
  }

  async rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: RpcCannedData; error: null | { message: string } }> {
    this.calls.push({ fn, args });
    const factory = this.canned.get(fn);
    if (factory) return factory();
    return { data: null, error: null };
  }

  async adminCreateUser(email: string): Promise<{ userId: string }> {
    this.calls.push({ fn: "__adminCreateUser", args: { email } });
    this.adminCreateUserCalled = true;
    return { userId: this.createdUserId };
  }

  async mintSession(userId: string): Promise<{ access_token: string; refresh_token: string }> {
    this.calls.push({ fn: "__mintSession", args: { userId } });
    this.mintSessionCalled = true;
    this.mintedForUserId = userId;
    return { access_token: "fake-access-token", refresh_token: "fake-refresh-token" };
  }

  /** Helper: find all recorded rpc calls with a given fn name. */
  rpcsNamed(fn: string): RpcCall[] {
    return this.calls.filter((c) => c.fn === fn);
  }
}

// ---------------------------------------------------------------------------
// Fake fetch (returns a canned token response)
// ---------------------------------------------------------------------------

function makeFakeFetch(tokenPayload: Record<string, unknown>): typeof fetch {
  // deno-lint-ignore require-await
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(tokenPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-1111-1111-111111111111";
const APP_SCHEME = "logged://oauth/callback";

function makeEnv(extras: Record<string, string> = {}): (key: string) => string | undefined {
  const vars: Record<string, string> = {
    GOOGLE_CALENDAR_CLIENT_ID: "gc-client-id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "gc-secret",
    GOOGLE_CALENDAR_REDIRECT_URI: "https://example.com/callback/google_calendar",
    NOTION_CLIENT_ID: "notion-client-id",
    NOTION_CLIENT_SECRET: "notion-secret",
    NOTION_REDIRECT_URI: "https://example.com/callback/notion",
    STRAVA_CLIENT_ID: "strava-client-id",
    STRAVA_CLIENT_SECRET: "strava-secret",
    STRAVA_REDIRECT_URI: "https://example.com/callback/strava",
    ...extras,
  };
  return (key: string) => vars[key];
}

// ---------------------------------------------------------------------------
// handleAuthorize — google_calendar (PKCE provider)
// ---------------------------------------------------------------------------

Deno.test("handleAuthorize google_calendar: returns 302 redirect with code_challenge", async () => {
  const db = new FakeSupabase();
  db.setCanned("create_oauth_state", () => ({ data: "state-abc123", error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleAuthorize("google_calendar", USER_ID, deps);

  assertEquals(result.status, 302);
  assert(result.redirect !== undefined, "redirect must be set");
  const url = new URL(result.redirect!);
  // Must include PKCE challenge
  assert(url.searchParams.has("code_challenge"), "should have code_challenge");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.get("state"), "state-abc123");
  assertEquals(url.searchParams.get("client_id"), "gc-client-id");
});

Deno.test("handleAuthorize google_calendar: persists create_oauth_state with non-null verifier", async () => {
  const db = new FakeSupabase();
  db.setCanned("create_oauth_state", () => ({ data: "state-xyz", error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  await handleAuthorize("google_calendar", USER_ID, deps);

  const stateRpcs = db.rpcsNamed("create_oauth_state");
  assertEquals(stateRpcs.length, 1);
  const args = stateRpcs[0].args;
  assertEquals(args["p_provider"], "google_calendar");
  assertEquals(args["p_user_id"], USER_ID);
  // verifier must be a non-empty string (PKCE)
  assert(typeof args["p_code_verifier"] === "string", "p_code_verifier should be a string");
  assert((args["p_code_verifier"] as string).length > 0, "verifier must not be empty");
});

Deno.test("handleAuthorize strava: no code_challenge in redirect (non-PKCE)", async () => {
  const db = new FakeSupabase();
  db.setCanned("create_oauth_state", () => ({ data: "strava-state", error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleAuthorize("strava", USER_ID, deps);
  assertEquals(result.status, 302);
  const url = new URL(result.redirect!);
  assertEquals(url.searchParams.has("code_challenge"), false);
  // verifier arg should be null/undefined for non-PKCE
  const stateRpcs = db.rpcsNamed("create_oauth_state");
  const verifier = stateRpcs[0].args["p_code_verifier"];
  assert(verifier === null || verifier === undefined, "non-PKCE should have null verifier");
});

// ---------------------------------------------------------------------------
// handleStravaCallback — bad/expired state → 400
// ---------------------------------------------------------------------------

Deno.test("handleStravaCallback: bad state returns 400", async () => {
  const db = new FakeSupabase();
  // consume_oauth_state returns empty array => state not found / expired
  db.setCanned("consume_oauth_state", () => ({ data: [], error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleStravaCallback({ state: "bad-state", code: "whatever" }, deps);
  assertEquals(result.status, 400);
});

// ---------------------------------------------------------------------------
// handleStravaCallback — valid state, existing athlete => skips adminCreateUser
// ---------------------------------------------------------------------------

Deno.test("handleStravaCallback: existing athlete does NOT call adminCreateUser", async () => {
  const ATHLETE_ID = "999";
  const EXISTING_USER_ID = "22222222-2222-2222-2222-222222222222";

  const db = new FakeSupabase();
  db.setCanned("consume_oauth_state", () => ({
    data: [{ user_id: null, provider: "strava", code_verifier: null }],
    error: null,
  }));
  db.setCanned("find_strava_connection", () => ({
    data: [{ user_id: EXISTING_USER_ID, connection_id: "conn-1" }],
    error: null,
  }));
  db.setCanned("attach_connection", () => ({ data: "conn-id-1", error: null }));
  db.setCanned("create_auth_handoff", () => ({ data: "handoff-code-abc", error: null }));

  const tokenPayload = {
    access_token: "strava-at",
    refresh_token: "strava-rt",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    athlete: { id: Number(ATHLETE_ID) },
  };

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch(tokenPayload),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleStravaCallback({ state: "valid-state", code: "strava-code" }, deps);

  assertEquals(result.status, 302);
  assertEquals(db.adminCreateUserCalled, false);
  // redirect must contain app scheme and code
  assert(result.redirect!.startsWith("logged://oauth/callback"), "redirect scheme mismatch");
  assertMatch(result.redirect!, /code=handoff-code-abc/);

  // attach_connection and create_auth_handoff must have been called
  assert(db.rpcsNamed("attach_connection").length === 1, "attach_connection should be called");
  assert(db.rpcsNamed("create_auth_handoff").length === 1, "create_auth_handoff should be called");
  assertEquals(db.rpcsNamed("create_auth_handoff")[0].args["p_user_id"], EXISTING_USER_ID);
});

// ---------------------------------------------------------------------------
// handleStravaCallback — new athlete => calls adminCreateUser then attach_connection
// ---------------------------------------------------------------------------

Deno.test("handleStravaCallback: new athlete calls adminCreateUser then attach_connection", async () => {
  const ATHLETE_ID = "777";

  const db = new FakeSupabase();
  db.setCanned("consume_oauth_state", () => ({
    data: [{ user_id: null, provider: "strava", code_verifier: null }],
    error: null,
  }));
  // find_strava_connection returns empty => new athlete
  db.setCanned("find_strava_connection", () => ({ data: [], error: null }));
  db.setCanned("attach_connection", () => ({ data: "conn-id-2", error: null }));
  db.setCanned("create_auth_handoff", () => ({ data: "handoff-xyz", error: null }));

  const tokenPayload = {
    access_token: "at",
    refresh_token: "rt",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    athlete: { id: Number(ATHLETE_ID) },
  };

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch(tokenPayload),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleStravaCallback({ state: "valid-state", code: "strava-code" }, deps);

  assertEquals(result.status, 302);
  assertEquals(db.adminCreateUserCalled, true);

  // attach_connection must be called with the created user id
  const attachCalls = db.rpcsNamed("attach_connection");
  assertEquals(attachCalls.length, 1);
  assertEquals(attachCalls[0].args["p_user_id"], "fake-created-user-id");
  assertEquals(attachCalls[0].args["p_provider"], "strava");
  assertEquals(attachCalls[0].args["p_external_account_id"], ATHLETE_ID);

  assert(result.redirect!.includes("code=handoff-xyz"), "redirect should contain handoff code");
});

// ---------------------------------------------------------------------------
// handleLinkedCallback — notion → pending_config redirect
// ---------------------------------------------------------------------------

Deno.test("handleLinkedCallback notion: attaches as pending_config, redirect has status=pending_config", async () => {
  const LINKED_USER_ID = "33333333-3333-3333-3333-333333333333";
  const VERIFIER = "my-pkce-verifier-value";

  const db = new FakeSupabase();
  db.setCanned("consume_oauth_state", () => ({
    data: [{ user_id: LINKED_USER_ID, provider: "notion", code_verifier: VERIFIER }],
    error: null,
  }));
  db.setCanned("attach_connection", () => ({ data: "notion-conn-id", error: null }));

  // Fake notion token response (notion returns workspace info)
  const tokenPayload = {
    access_token: "notion-at",
    // notion does not issue refresh tokens
    token_type: "bearer",
    workspace_id: "ws-123",
  };

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch(tokenPayload),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleLinkedCallback("notion", { state: "valid-state", code: "notion-code" }, deps);

  assertEquals(result.status, 302);
  assert(result.redirect !== undefined);
  assertMatch(result.redirect!, /status=pending_config/);
  assertMatch(result.redirect!, /provider=notion/);

  // attach_connection must use 'pending_config' status
  const attachCalls = db.rpcsNamed("attach_connection");
  assertEquals(attachCalls.length, 1);
  assertEquals(attachCalls[0].args["p_status"], "pending_config");
  assertEquals(attachCalls[0].args["p_user_id"], LINKED_USER_ID);
  assertEquals(attachCalls[0].args["p_provider"], "notion");
});

Deno.test("handleLinkedCallback: missing user_id in state (linking flow) returns 400", async () => {
  const db = new FakeSupabase();
  // consume returns a row but user_id is null (not a linking flow)
  db.setCanned("consume_oauth_state", () => ({
    data: [{ user_id: null, provider: "notion", code_verifier: null }],
    error: null,
  }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleLinkedCallback("notion", { state: "s", code: "c" }, deps);
  assertEquals(result.status, 400);
});

Deno.test("handleLinkedCallback: expired/bad state returns 400", async () => {
  const db = new FakeSupabase();
  db.setCanned("consume_oauth_state", () => ({ data: [], error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleLinkedCallback("google_calendar", { state: "bad", code: "c" }, deps);
  assertEquals(result.status, 400);
});

// ---------------------------------------------------------------------------
// handleSessionExchange
// ---------------------------------------------------------------------------

Deno.test("handleSessionExchange: valid handoff returns 200 with session", async () => {
  const HANDOFF_USER_ID = "44444444-4444-4444-4444-444444444444";
  const db = new FakeSupabase();
  db.setCanned("consume_auth_handoff", () => ({ data: HANDOFF_USER_ID, error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleSessionExchange("valid-handoff-code", deps);

  assertEquals(result.status, 200);
  assert(result.body !== undefined);
  assertEquals((result.body as { access_token: string }).access_token, "fake-access-token");
  assertEquals(db.mintedForUserId, HANDOFF_USER_ID);
});

Deno.test("handleSessionExchange: consumed/invalid handoff returns 401", async () => {
  const db = new FakeSupabase();
  // consume_auth_handoff returns null => already consumed or expired
  db.setCanned("consume_auth_handoff", () => ({ data: null, error: null }));

  const deps: HandlerDeps = {
    db,
    fetchImpl: makeFakeFetch({}),
    env: makeEnv(),
    appRedirectScheme: APP_SCHEME,
  };

  const result = await handleSessionExchange("invalid-code", deps);
  assertEquals(result.status, 401);
  assertEquals(db.mintSessionCalled, false);
});
