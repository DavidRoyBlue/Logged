import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Dependency-injection interface (keeps core logic testable without mocks of
// RN internals or real network calls).
// ---------------------------------------------------------------------------

export interface AuthDeps {
  /** Wraps WebBrowser.openAuthSessionAsync */
  openAuthSession(
    url: string,
    redirect: string
  ): Promise<{ type: string; url?: string }>;
  /** Wraps the global fetch */
  fetchImpl: typeof fetch;
  /** Wraps supabase.auth.setSession */
  setSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<void>;
  /** Base URL for Edge Functions, e.g. https://xyz.supabase.co/functions/v1 */
  functionsBaseUrl: string;
  /** Deep-link redirect scheme, e.g. "logged://oauth/callback" */
  redirectScheme: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the `code` query-param from a `logged://oauth/callback?code=…` URL.
 * Returns null if no code (or empty code) is present.
 */
export function parseCodeFromCallback(url: string): string | null {
  try {
    // URL() requires a proper scheme; logged:// is valid enough for the parser.
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    return code && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider → Edge Function name mapping
// ---------------------------------------------------------------------------
type ConnectProvider = "google_calendar" | "notion";

function providerToFunctionName(provider: ConnectProvider): string {
  switch (provider) {
    case "google_calendar":
      return "oauth-google-calendar";
    case "notion":
      return "oauth-notion";
  }
}

// ---------------------------------------------------------------------------
// Core auth flows (all I/O injected for testability)
// ---------------------------------------------------------------------------

/**
 * Opens the Strava OAuth flow in an in-app browser, exchanges the resulting
 * code for a Supabase session via the `session-exchange` Edge Function, and
 * stores the session.
 */
export async function signInWithStrava(
  deps: AuthDeps
): Promise<{ ok: boolean; reason?: string }> {
  const authorizeUrl = `${deps.functionsBaseUrl}/oauth-strava`;

  const result = await deps.openAuthSession(authorizeUrl, deps.redirectScheme);

  if (result.type !== "success") {
    return { ok: false, reason: "cancelled" };
  }

  const callbackUrl = result.url;
  if (!callbackUrl) {
    return { ok: false, reason: "no_callback_url" };
  }

  const code = parseCodeFromCallback(callbackUrl);
  if (!code) {
    return { ok: false, reason: "no_code" };
  }

  // Exchange the authorization code for tokens via the Edge Function.
  const exchangeUrl = `${deps.functionsBaseUrl}/session-exchange`;
  const response = await deps.fetchImpl(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    return { ok: false, reason: `exchange_failed_${response.status}` };
  }

  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };

  await deps.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  return { ok: true };
}

/**
 * Opens a provider-specific OAuth flow (e.g. Google Calendar, Notion) for
 * linking an account to an already-authenticated user.
 *
 * @param provider  The integration to connect.
 * @param accessToken  The user's current Supabase access token (passed to the
 *                     Edge Function via `?token=` so it can identify the user).
 */
export async function connect(
  provider: ConnectProvider,
  accessToken: string,
  deps: AuthDeps
): Promise<{ ok: boolean }> {
  const fnName = providerToFunctionName(provider);
  const url = `${deps.functionsBaseUrl}/${fnName}?token=${encodeURIComponent(accessToken)}`;

  const result = await deps.openAuthSession(url, deps.redirectScheme);

  return { ok: result.type === "success" };
}

// ---------------------------------------------------------------------------
// React hook — uses real supabase client (not injected; hard to unit-test
// meaningfully without a full RN render environment).
// ---------------------------------------------------------------------------

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Seed with the current session on mount.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Subscribe to future auth state changes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
