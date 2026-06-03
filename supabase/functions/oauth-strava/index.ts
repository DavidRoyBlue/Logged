/**
 * oauth-strava — Supabase Edge Function
 *
 * Routes:
 *   GET /oauth-strava?action=authorize          → redirect to Strava consent page
 *   GET /oauth-strava?state=<s>&code=<c>        → handle Strava callback
 */

import { handleAuthorize, handleStravaCallback } from "../_shared/handlers.ts";
import { buildSupabaseLike } from "../_shared/supabase_adapter.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const params = url.searchParams;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const appRedirectScheme = Deno.env.get("APP_REDIRECT_SCHEME") ?? "logged://oauth/callback";

  const db = buildSupabaseLike(supabaseUrl, serviceRoleKey);
  const env = (key: string) => Deno.env.get(key);

  const deps = { db, fetchImpl: fetch, env, appRedirectScheme };

  // Callback: both state and code are present
  if (params.has("state") && params.has("code")) {
    const result = await handleStravaCallback(
      { state: params.get("state")!, code: params.get("code")! },
      deps
    );
    if (result.redirect) {
      return Response.redirect(result.redirect, result.status);
    }
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authorize: start the OAuth flow
  // user_id may be provided if the caller already knows it (optional for Strava)
  const userId = params.get("user_id") ?? null;
  const result = await handleAuthorize("strava", userId, deps);
  if (result.redirect) {
    return Response.redirect(result.redirect, result.status);
  }
  return new Response(JSON.stringify(result.body ?? {}), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
