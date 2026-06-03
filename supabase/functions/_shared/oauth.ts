import type { ProviderConfig } from "./providers.ts";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  raw: unknown;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

// ---------------------------------------------------------------------------
// Internal: base64url encoding
// ---------------------------------------------------------------------------

function toBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes32(): ArrayBuffer {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf.buffer;
}

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/** Returns a base64url-encoded 32-byte random value for use as OAuth state. */
export function randomState(): string {
  return toBase64url(randomBytes32());
}

/** Returns a base64url-encoded 32-byte random value suitable as a PKCE verifier. */
export function randomVerifier(): string {
  return toBase64url(randomBytes32());
}

/** Computes base64url(SHA-256(verifier)) — the PKCE S256 code_challenge. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64url(digest);
}

/** Generates a PKCE verifier/challenge pair. */
export async function pkcePair(): Promise<PkcePair> {
  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(
  cfg: ProviderConfig,
  opts: {
    clientId: string;
    redirectUri: string;
    state: string;
    challenge?: string;
  }
): string {
  const url = new URL(cfg.authorizeUrl);
  const p = url.searchParams;

  p.set("response_type", "code");
  p.set("client_id", opts.clientId);
  p.set("redirect_uri", opts.redirectUri);
  if (cfg.scope) p.set("scope", cfg.scope);
  p.set("state", opts.state);

  if (cfg.usesPkce && opts.challenge) {
    p.set("code_challenge", opts.challenge);
    p.set("code_challenge_method", "S256");
  }

  if (cfg.extraAuthorizeParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthorizeParams)) {
      p.set(k, v);
    }
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// Internal: parse token response into OAuthTokens
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function parseTokenResponse(json: any): OAuthTokens {
  const accessToken: string = json.access_token;
  const refreshToken: string | null = json.refresh_token ?? null;

  let expiresAt: string | null = null;
  if (typeof json.expires_at === "number") {
    // Provider returns epoch seconds (e.g., Strava)
    expiresAt = new Date(json.expires_at * 1000).toISOString();
  } else if (typeof json.expires_in === "number") {
    // Provider returns seconds from now (e.g., Google)
    expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  }

  return { accessToken, refreshToken, expiresAt, raw: json };
}

// ---------------------------------------------------------------------------
// exchangeCode
// ---------------------------------------------------------------------------

export async function exchangeCode(
  cfg: ProviderConfig,
  opts: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    verifier?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  });

  if (opts.verifier) {
    body.set("code_verifier", opts.verifier);
  }

  const res = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  const json = await res.json();
  return parseTokenResponse(json);
}

// ---------------------------------------------------------------------------
// refreshAccessToken
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  cfg: ProviderConfig,
  opts: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });

  const res = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  const json = await res.json();
  return parseTokenResponse(json);
}
