import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  pkceChallenge,
  pkcePair,
  randomState,
  randomVerifier,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
} from "./oauth.ts";

import { PROVIDERS } from "./providers.ts";

// ---------------------------------------------------------------------------
// Helpers used in tests
// ---------------------------------------------------------------------------

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// pkceChallenge — known vector
// ---------------------------------------------------------------------------

Deno.test("pkceChallenge matches independent SHA-256(verifier) computation", async () => {
  const verifier = "abc";
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const expected = base64url(digest);

  const actual = await pkceChallenge(verifier);
  assertEquals(actual, expected);
});

// ---------------------------------------------------------------------------
// pkcePair — verifier/challenge consistency
// ---------------------------------------------------------------------------

Deno.test("pkcePair: challenge === pkceChallenge(verifier)", async () => {
  const pair = await pkcePair();
  const expected = await pkceChallenge(pair.verifier);
  assertEquals(pair.challenge, expected);
});

Deno.test("pkcePair: verifier is non-empty base64url string", async () => {
  const pair = await pkcePair();
  assertMatch(pair.verifier, /^[A-Za-z0-9\-_]+$/);
  assertNotEquals(pair.verifier, "");
});

// ---------------------------------------------------------------------------
// randomState / randomVerifier
// ---------------------------------------------------------------------------

Deno.test("randomState returns different values on successive calls", () => {
  const a = randomState();
  const b = randomState();
  assertNotEquals(a, b);
  assertMatch(a, /^[A-Za-z0-9\-_]+$/);
});

Deno.test("randomVerifier returns different values on successive calls", () => {
  const a = randomVerifier();
  const b = randomVerifier();
  assertNotEquals(a, b);
  assertMatch(a, /^[A-Za-z0-9\-_]+$/);
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl — Google Calendar (PKCE provider)
// ---------------------------------------------------------------------------

Deno.test("buildAuthorizeUrl for google_calendar includes PKCE and extra params", async () => {
  const pair = await pkcePair();
  const url = new URL(
    buildAuthorizeUrl(PROVIDERS.google_calendar, {
      clientId: "my-client-id",
      redirectUri: "https://example.com/callback",
      state: "my-state",
      challenge: pair.challenge,
    })
  );

  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("client_id"), "my-client-id");
  assertEquals(url.searchParams.get("redirect_uri"), "https://example.com/callback");
  assertEquals(url.searchParams.get("state"), "my-state");
  assertEquals(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/calendar.events"
  );
  assertEquals(url.searchParams.get("code_challenge"), pair.challenge);
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.get("access_type"), "offline");
  assertEquals(url.searchParams.get("prompt"), "consent");
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl — Strava (non-PKCE provider)
// ---------------------------------------------------------------------------

Deno.test("buildAuthorizeUrl for strava: no code_challenge, comma scope, correct base params", () => {
  const url = new URL(
    buildAuthorizeUrl(PROVIDERS.strava, {
      clientId: "strava-client",
      redirectUri: "https://example.com/callback",
      state: "strava-state",
    })
  );

  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("client_id"), "strava-client");
  assertEquals(url.searchParams.get("redirect_uri"), "https://example.com/callback");
  assertEquals(url.searchParams.get("state"), "strava-state");
  assertEquals(url.searchParams.get("scope"), "read,activity:read_all");
  assertEquals(url.searchParams.get("code_challenge"), null);
  assertEquals(url.searchParams.get("code_challenge_method"), null);
  assertEquals(url.origin + url.pathname, PROVIDERS.strava.authorizeUrl);
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl — Notion (empty scope, PKCE)
// ---------------------------------------------------------------------------

Deno.test("buildAuthorizeUrl for notion: no scope param when scope is empty", async () => {
  const pair = await pkcePair();
  const url = new URL(
    buildAuthorizeUrl(PROVIDERS.notion, {
      clientId: "notion-client",
      redirectUri: "https://example.com/cb",
      state: "s",
      challenge: pair.challenge,
    })
  );

  assertEquals(url.searchParams.get("scope"), null);
  assertEquals(url.searchParams.get("owner"), "user");
  assertEquals(url.searchParams.get("code_challenge"), pair.challenge);
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
});

// ---------------------------------------------------------------------------
// exchangeCode — injected fake fetch (expires_at epoch from Strava-style)
// ---------------------------------------------------------------------------

Deno.test("exchangeCode: posts urlencoded body, returns parsed tokens (expires_at)", async () => {
  const fakeResponse = {
    access_token: "AT",
    refresh_token: "RT",
    expires_at: 1893456000, // Strava-style epoch seconds
  };

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify(fakeResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const tokens = await exchangeCode(
    PROVIDERS.strava,
    {
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://example.com/cb",
      code: "AUTH_CODE",
    },
    fakeFetch
  );

  // Verify tokens
  assertEquals(tokens.accessToken, "AT");
  assertEquals(tokens.refreshToken, "RT");
  assertNotEquals(tokens.expiresAt, null);

  // expiresAt should be epoch 1893456000 as ISO string
  assertEquals(tokens.expiresAt, new Date(1893456000 * 1000).toISOString());

  // Verify request to right URL
  assertEquals(capturedUrl, PROVIDERS.strava.tokenUrl);
  assertEquals(capturedInit?.method, "POST");

  // Verify body contains required fields
  const body = capturedInit?.body as string;
  const params = new URLSearchParams(body);
  assertEquals(params.get("grant_type"), "authorization_code");
  assertEquals(params.get("code"), "AUTH_CODE");
  assertEquals(params.get("client_id"), "cid");
  assertEquals(params.get("client_secret"), "csec");
  assertEquals(params.get("redirect_uri"), "https://example.com/cb");

  // Verify Content-Type header
  const headers = capturedInit?.headers as Record<string, string>;
  assertEquals(
    (headers["Content-Type"] || headers["content-type"]).toLowerCase(),
    "application/x-www-form-urlencoded"
  );
});

// ---------------------------------------------------------------------------
// exchangeCode — expires_in style (non-Strava)
// ---------------------------------------------------------------------------

Deno.test("exchangeCode: handles expires_in (seconds from now) when expires_at absent", async () => {
  const now = Date.now();
  const fakeResponse = {
    access_token: "ACCESS",
    refresh_token: null,
    expires_in: 3600,
  };

  const fakeFetch = async (): Promise<Response> =>
    new Response(JSON.stringify(fakeResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const tokens = await exchangeCode(
    PROVIDERS.google_calendar,
    {
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://example.com/cb",
      code: "CODE",
      verifier: "myverifier",
    },
    fakeFetch
  );

  assertEquals(tokens.accessToken, "ACCESS");
  assertEquals(tokens.refreshToken, null);
  assertNotEquals(tokens.expiresAt, null);

  // expiresAt should be approximately now + 3600s
  const expiresAt = new Date(tokens.expiresAt!).getTime();
  const expectedMin = now + 3599_000;
  const expectedMax = now + 3601_000;
  assertEquals(expiresAt >= expectedMin && expiresAt <= expectedMax, true);
});

// ---------------------------------------------------------------------------
// exchangeCode — verifier is included when provided
// ---------------------------------------------------------------------------

Deno.test("exchangeCode: includes code_verifier in body when provided", async () => {
  let capturedBody = "";

  const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedBody = init?.body as string;
    return new Response(
      JSON.stringify({ access_token: "A", refresh_token: "R", expires_in: 3600 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  await exchangeCode(
    PROVIDERS.google_calendar,
    {
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://example.com/cb",
      code: "CODE",
      verifier: "my_verifier_value",
    },
    fakeFetch
  );

  const params = new URLSearchParams(capturedBody);
  assertEquals(params.get("code_verifier"), "my_verifier_value");
});

// ---------------------------------------------------------------------------
// refreshAccessToken — injected fake fetch
// ---------------------------------------------------------------------------

Deno.test("refreshAccessToken: posts grant_type=refresh_token and returns parsed tokens", async () => {
  const fakeResponse = {
    access_token: "NEW_AT",
    refresh_token: "NEW_RT",
    expires_in: 7200,
  };

  let capturedUrl = "";
  let capturedBody = "";

  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(url);
    capturedBody = init?.body as string;
    return new Response(JSON.stringify(fakeResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const tokens = await refreshAccessToken(
    PROVIDERS.google_calendar,
    {
      clientId: "cid",
      clientSecret: "csec",
      refreshToken: "OLD_RT",
    },
    fakeFetch
  );

  assertEquals(tokens.accessToken, "NEW_AT");
  assertEquals(tokens.refreshToken, "NEW_RT");
  assertNotEquals(tokens.expiresAt, null);

  assertEquals(capturedUrl, PROVIDERS.google_calendar.tokenUrl);

  const params = new URLSearchParams(capturedBody);
  assertEquals(params.get("grant_type"), "refresh_token");
  assertEquals(params.get("refresh_token"), "OLD_RT");
  assertEquals(params.get("client_id"), "cid");
  assertEquals(params.get("client_secret"), "csec");
});

// ---------------------------------------------------------------------------
// refreshAccessToken — null refresh_token in response
// ---------------------------------------------------------------------------

Deno.test("refreshAccessToken: handles null refresh_token in response", async () => {
  const fakeFetch = async (): Promise<Response> =>
    new Response(
      JSON.stringify({ access_token: "AT", expires_in: 3600 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const tokens = await refreshAccessToken(
    PROVIDERS.strava,
    { clientId: "cid", clientSecret: "csec", refreshToken: "RT" },
    fakeFetch
  );

  assertEquals(tokens.accessToken, "AT");
  assertEquals(tokens.refreshToken, null);
});
