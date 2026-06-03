/**
 * session-exchange — Supabase Edge Function
 *
 * Exchanges a one-time auth handoff code for a Supabase session token.
 *
 * Routes:
 *   POST /session-exchange   body: { code: string }
 */

import { handleSessionExchange } from "../_shared/handlers.ts";
import { buildSupabaseLike } from "../_shared/supabase_adapter.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const code = body.code;
  if (!code) {
    return new Response(JSON.stringify({ error: "Missing required field: code" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const appRedirectScheme = Deno.env.get("APP_REDIRECT_SCHEME") ?? "logged://oauth/callback";

  const db = buildSupabaseLike(supabaseUrl, serviceRoleKey);
  const env = (key: string) => Deno.env.get(key);

  const deps = { db, fetchImpl: fetch, env, appRedirectScheme };

  const result = await handleSessionExchange(code, deps);

  return new Response(JSON.stringify(result.body ?? {}), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
