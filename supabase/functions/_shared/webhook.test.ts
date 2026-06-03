/**
 * webhook.test.ts — deno test suite for the factored Strava webhook handlers.
 *
 * Uses a fake WebhookDb and fake env accessor; no live network needed.
 * The hard invariant tested throughout: POST event handlers ALWAYS return 200.
 */

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleValidation,
  handleEvent,
  type WebhookDb,
  type WebhookDeps,
  type StravaEvent,
} from "./webhook.ts";

// ---------------------------------------------------------------------------
// Fake WebhookDb — records every rpc call and returns canned results
// ---------------------------------------------------------------------------

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

class FakeDb implements WebhookDb {
  calls: RpcCall[] = [];
  private canned: Map<string, { data: unknown; error: unknown }> = new Map();

  /** Set a canned return value for a given rpc function name. */
  setCanned(fn: string, result: { data: unknown; error: unknown }): void {
    this.canned.set(fn, result);
  }

  async rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }> {
    this.calls.push({ fn, args });
    return this.canned.get(fn) ?? { data: null, error: null };
  }

  /** Returns all recorded calls with the given fn name. */
  rpcsNamed(fn: string): RpcCall[] {
    return this.calls.filter((c) => c.fn === fn);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VERIFY_TOKEN = "super-secret-verify-token";

function makeEnv(extras: Record<string, string> = {}): (k: string) => string | undefined {
  const vars: Record<string, string> = {
    STRAVA_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
    ...extras,
  };
  return (k: string) => vars[k];
}

function makeDeps(db: FakeDb, envOverrides: Record<string, string> = {}): WebhookDeps {
  return { db, env: makeEnv(envOverrides) };
}

// ---------------------------------------------------------------------------
// handleValidation — GET subscription validation
// ---------------------------------------------------------------------------

Deno.test("handleValidation: matching verify_token returns 200 and echoes challenge", () => {
  const db = new FakeDb();
  const deps = makeDeps(db);

  const query = {
    "hub.mode": "subscribe",
    "hub.challenge": "abc123challenge",
    "hub.verify_token": VERIFY_TOKEN,
  };

  const result = handleValidation(query, deps);

  assertEquals(result.status, 200);
  assert(result.body !== undefined, "body must be set");
  assertEquals((result.body as Record<string, string>)["hub.challenge"], "abc123challenge");
  // No rpc should be called for validation
  assertEquals(db.calls.length, 0);
});

Deno.test("handleValidation: mismatched verify_token returns 403", () => {
  const db = new FakeDb();
  const deps = makeDeps(db);

  const query = {
    "hub.mode": "subscribe",
    "hub.challenge": "xyz",
    "hub.verify_token": "wrong-token",
  };

  const result = handleValidation(query, deps);

  assertEquals(result.status, 403);
  assertEquals(db.calls.length, 0);
});

Deno.test("handleValidation: missing verify_token returns 403", () => {
  const db = new FakeDb();
  // env has no STRAVA_WEBHOOK_VERIFY_TOKEN set
  const deps: WebhookDeps = {
    db,
    env: (_k: string) => undefined,
  };

  const query = {
    "hub.mode": "subscribe",
    "hub.challenge": "xyz",
    "hub.verify_token": "anything",
  };

  const result = handleValidation(query, deps);

  assertEquals(result.status, 403);
});

// ---------------------------------------------------------------------------
// handleEvent — activity create
// ---------------------------------------------------------------------------

Deno.test("handleEvent: activity create calls enqueue_strava_ingest with op=create, returns 200", async () => {
  const db = new FakeDb();
  db.setCanned("enqueue_strava_ingest", { data: true, error: null });
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "activity",
    aspect_type: "create",
    object_id: 987654321,
    owner_id: 12345,
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  const calls = db.rpcsNamed("enqueue_strava_ingest");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args["p_athlete_id"], "12345");        // stringified
  assertEquals(calls[0].args["p_strava_activity_id"], 987654321);
  assertEquals(calls[0].args["p_op"], "create");
});

Deno.test("handleEvent: activity update calls enqueue_strava_ingest with op=update, returns 200", async () => {
  const db = new FakeDb();
  db.setCanned("enqueue_strava_ingest", { data: true, error: null });
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "activity",
    aspect_type: "update",
    object_id: 111,
    owner_id: 999,
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  const calls = db.rpcsNamed("enqueue_strava_ingest");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args["p_op"], "update");
});

Deno.test("handleEvent: activity create where rpc returns false (revoked) still returns 200", async () => {
  const db = new FakeDb();
  // Simulates enqueue returning false (e.g. athlete not found / revoked token)
  db.setCanned("enqueue_strava_ingest", { data: false, error: null });
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "activity",
    aspect_type: "create",
    object_id: 555,
    owner_id: 111,
  };

  const result = await handleEvent(event, deps);

  // HARD INVARIANT: must still be 200
  assertEquals(result.status, 200);
  // enqueue was still called
  assertEquals(db.rpcsNamed("enqueue_strava_ingest").length, 1);
});

// ---------------------------------------------------------------------------
// handleEvent — activity delete
// ---------------------------------------------------------------------------

Deno.test("handleEvent: activity delete calls enqueue_strava_ingest with op=delete, returns 200", async () => {
  const db = new FakeDb();
  db.setCanned("enqueue_strava_ingest", { data: true, error: null });
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "activity",
    aspect_type: "delete",
    object_id: 222,
    owner_id: 333,
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  const calls = db.rpcsNamed("enqueue_strava_ingest");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args["p_athlete_id"], "333");
  assertEquals(calls[0].args["p_strava_activity_id"], 222);
  assertEquals(calls[0].args["p_op"], "delete");
});

// ---------------------------------------------------------------------------
// handleEvent — athlete deauthorization
// ---------------------------------------------------------------------------

Deno.test("handleEvent: athlete event with authorized=false calls handle_strava_deauth, returns 200", async () => {
  const db = new FakeDb();
  db.setCanned("handle_strava_deauth", { data: null, error: null });
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "athlete",
    aspect_type: "update",
    object_id: 444,
    owner_id: 444,
    updates: { authorized: "false" },
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  const calls = db.rpcsNamed("handle_strava_deauth");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args["p_athlete_id"], "444");
  // enqueue must NOT have been called
  assertEquals(db.rpcsNamed("enqueue_strava_ingest").length, 0);
});

Deno.test("handleEvent: athlete event with authorized=true is ignored (no deauth, no enqueue), returns 200", async () => {
  const db = new FakeDb();
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "athlete",
    aspect_type: "update",
    object_id: 555,
    owner_id: 555,
    updates: { authorized: "true" },
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  assertEquals(db.calls.length, 0);
});

// ---------------------------------------------------------------------------
// handleEvent — unknown / ignored event types
// ---------------------------------------------------------------------------

Deno.test("handleEvent: unknown object_type returns 200 without any rpc call", async () => {
  const db = new FakeDb();
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "gear",   // not handled
    aspect_type: "create",
    object_id: 777,
    owner_id: 888,
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  assertEquals(db.calls.length, 0);
});

Deno.test("handleEvent: athlete event with no updates is ignored, returns 200", async () => {
  const db = new FakeDb();
  const deps = makeDeps(db);

  const event: StravaEvent = {
    object_type: "athlete",
    aspect_type: "update",
    object_id: 666,
    owner_id: 666,
    // no updates field
  };

  const result = await handleEvent(event, deps);

  assertEquals(result.status, 200);
  assertEquals(db.calls.length, 0);
});
