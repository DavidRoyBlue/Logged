/**
 * strava-webhook — Supabase Edge Function
 *
 * Routes:
 *   GET  /strava-webhook?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
 *        → Strava subscription validation handshake (echoes challenge if token matches)
 *
 *   POST /strava-webhook  (body: StravaEvent JSON)
 *        → Enqueue-only event routing. ALWAYS returns 200 (Strava retries non-200).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleValidation,
  handleEvent,
  type WebhookDb,
  type StravaEvent,
} from "../_shared/webhook.ts";

// ---------------------------------------------------------------------------
// Build a minimal WebhookDb from the Supabase service client
// (WebhookDb only needs rpc(); no adminCreateUser / mintSession required here)
// ---------------------------------------------------------------------------

function buildWebhookDb(supabaseUrl: string, serviceRoleKey: string): WebhookDb {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      // deno-lint-ignore no-explicit-any
      return client.rpc(fn, args) as any;
    },
  };
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const db = buildWebhookDb(supabaseUrl, serviceRoleKey);
  const env = (k: string) => Deno.env.get(k);
  const deps = { db, env };

  const url = new URL(req.url);

  // GET — Strava subscription validation challenge
  if (req.method === "GET") {
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const result = handleValidation(query, deps);

    if (result.status === 200 && result.body !== undefined) {
      return new Response(JSON.stringify(result.body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: result.status });
  }

  // POST — Strava event delivery (always-200)
  if (req.method === "POST") {
    let event: StravaEvent;
    try {
      event = await req.json() as StravaEvent;
    } catch {
      // Malformed body: still return 200 to stop Strava retrying a bad payload.
      return new Response(null, { status: 200 });
    }

    const result = await handleEvent(event, deps);
    return new Response(null, { status: result.status });
  }

  // Any other method — 405
  return new Response(null, { status: 405 });
});
