/**
 * webhook.ts — Factored, dependency-injected Strava webhook handlers.
 *
 * Hard invariants:
 *   - handleEvent ALWAYS returns status 200 (Strava retries any non-200 response).
 *   - Handlers are enqueue-only; no heavy processing happens here.
 *
 * The thin entrypoint (strava-webhook/index.ts) wires real deps; tests inject fakes.
 */

// ---------------------------------------------------------------------------
// Dependency interfaces
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export interface WebhookDb {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }>;
}

export interface WebhookDeps {
  db: WebhookDb;
  env: (k: string) => string | undefined;
}

// ---------------------------------------------------------------------------
// Result shape (mirrors HandlerResult in handlers.ts)
// ---------------------------------------------------------------------------

export interface WebhookResult {
  status: number;
  body?: unknown;
}

// ---------------------------------------------------------------------------
// Strava event payload
// ---------------------------------------------------------------------------

export interface StravaEvent {
  object_type: string;
  aspect_type: string;
  object_id: number;
  owner_id: number;
  updates?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// handleValidation — GET subscription challenge
//
// Strava sends: ?hub.mode=subscribe&hub.challenge=<token>&hub.verify_token=<secret>
// We must echo the challenge back only if the verify_token matches.
// ---------------------------------------------------------------------------

export function handleValidation(
  query: Record<string, string>,
  deps: WebhookDeps
): WebhookResult {
  const expected = deps.env("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const received = query["hub.verify_token"];

  if (!expected || received !== expected) {
    return { status: 403 };
  }

  return {
    status: 200,
    body: { "hub.challenge": query["hub.challenge"] },
  };
}

// ---------------------------------------------------------------------------
// handleEvent — POST event routing
//
// NEVER returns non-200. Strava will retry any non-200 response indefinitely.
// ---------------------------------------------------------------------------

export async function handleEvent(
  event: StravaEvent,
  deps: WebhookDeps
): Promise<WebhookResult> {
  const { object_type, aspect_type, object_id, owner_id, updates } = event;

  if (object_type === "activity") {
    if (aspect_type === "create" || aspect_type === "update" || aspect_type === "delete") {
      await deps.db.rpc("enqueue_strava_ingest", {
        p_athlete_id: String(owner_id),
        p_strava_activity_id: object_id,
        p_op: aspect_type,
      });
    }
    // Other aspect_types for activities are ignored; still 200.
    return { status: 200 };
  }

  if (object_type === "athlete") {
    if (updates?.authorized === "false") {
      await deps.db.rpc("handle_strava_deauth", {
        p_athlete_id: String(owner_id),
      });
    }
    // authorized==="true" or any other update: ignore silently.
    return { status: 200 };
  }

  // Unknown object_type — ignore per Strava's forward-compatibility requirement.
  return { status: 200 };
}
