/**
 * oauth-google-calendar — Supabase Edge Function
 *
 * Routes:
 *   GET /oauth-google-calendar?user_id=<uid>       → redirect to Google consent page
 *   GET /oauth-google-calendar?state=<s>&code=<c>  → handle Google callback (linking flow)
 */

import { handleAuthorize, handleLinkedCallback } from "../_shared/handlers.ts";
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

  // Callback: both state and code present
  if (params.has("state") && params.has("code")) {
    const result = await handleLinkedCallback(
      "google_calendar",
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

  // Authorize: user_id is required for the linking flow
  const userId = params.get("user_id");
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const result = await handleAuthorize("google_calendar", userId, deps);
  if (result.redirect) {
    return Response.redirect(result.redirect, result.status);
  }
  return new Response(JSON.stringify(result.body ?? {}), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
