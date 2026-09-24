/**
 * Integration tests for the ingest worker.
 * Runs against the live local Supabase instance.
 * Uses a FakeStravaClient — no real network calls to Strava.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor,
} from "@supabase/supabase-js";
import ws from "ws";
import { processIngestJob, drainIngestQueue } from "./ingest";
import { FakeStravaClient } from "./strava";
import { Db } from "./db";

// `ws`'s WebSocket has an overloaded constructor (a `null`-only signature for
// server mode); realtime-js's WebSocketLikeConstructor only models the client
// signature, so a direct assignment doesn't structurally match.
const wsTransport = ws as unknown as WebSocketLikeConstructor;

// ---------------------------------------------------------------------------
// Supabase client helpers (mirror supabase/tests/helpers.ts)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "local-dev-service-role-key";

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: wsTransport },
  });
}

async function createTestUser(emailPrefix: string): Promise<string> {
  const admin = svc();
  const email = `${emailPrefix}-${Date.now()}@ingest-test.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function cleanupUser(userId: string): Promise<void> {
  await svc().auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// Sample Strava activity payloads
// ---------------------------------------------------------------------------
function makeRunActivity(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "Morning Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3100,
    total_elevation_gain: 50,
    type: "Run",
    sport_type: "Run",
    start_date: "2026-06-01T07:00:00Z",
    timezone: "(GMT-05:00) America/New_York",
    average_heartrate: 150,
    max_heartrate: 170,
    calories: 600,
    ...overrides,
  };
}

const ATHLETE_ZONES = {
  heart_rate: {
    custom_zones: false,
    zones: [
      { min: 0, max: 115 },
      { min: 115, max: 152 },
      { min: 152, max: 171 },
      { min: 171, max: 190 },
      { min: 190, max: -1 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("ingest worker integration", () => {
  const created: string[] = [];

  beforeEach(async () => {
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    await db.purgeAllQueues();
  });

  afterEach(async () => {
    for (const id of created) await cleanupUser(id);
    created.length = 0;
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  it("happy path: ingests a Run activity and enqueues sync", async () => {
    const userId = await createTestUser("ingest-happy");
    created.push(userId);

    const admin = svc();
    // Seed profile with athlete zones
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });

    // Seed strava connection via attach_connection (encrypts tokens)
    const connRes = await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "9001",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });
    expect(connRes.error).toBeNull();

    // Build fake strava client
    const fakeStrava = new FakeStravaClient({
      activities: { 42: makeRunActivity(42) },
      pages: [],
      refreshedTokens: {
        accessToken: "NEW-AT",
        refreshToken: "NEW-RT",
        expiresAt: "2031-01-01T00:00:00Z",
      },
    });

    const db = new Db({
      url: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    });

    const result = await processIngestJob(
      { user_id: userId, strava_activity_id: 42, op: "create" },
      { strava: fakeStrava, db }
    );
    expect(result).toBe("ingested");

    // Assert activity row exists with expected values
    const actRow = await admin
      .from("activities")
      .select("*")
      .eq("user_id", userId)
      .eq("strava_activity_id", 42)
      .single();
    expect(actRow.error).toBeNull();
    expect(actRow.data!.distance_m).toBe(10000);
    // avg_pace = 3000 / (10000/1000) = 300 s/km
    expect(actRow.data!.avg_pace_s_per_km).toBe(300);
    expect(actRow.data!.zone_distribution).not.toBeNull();

    // Assert sync_queue has a message for this user
    const qRead = await admin.rpc("pgmq_read", {
      queue_name: "sync_queue",
      vt: 5,
      qty: 100,
    });
    expect(qRead.error).toBeNull();
    const syncMsgs = (qRead.data as Array<{ message: Record<string, unknown> }>).map(
      (m) => m.message
    );
    expect(
      syncMsgs.some(
        (m) => m["user_id"] === userId && m["strava_activity_id"] === 42
      )
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Type filter
  // -------------------------------------------------------------------------
  it("type filter: returns 'dropped' and does not insert for a Ride", async () => {
    const userId = await createTestUser("ingest-drop");
    created.push(userId);

    const admin = svc();
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "9002",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    const fakeStrava = new FakeStravaClient({
      activities: { 55: makeRunActivity(55, { type: "Ride", sport_type: "Ride" }) },
      pages: [],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const result = await processIngestJob(
      { user_id: userId, strava_activity_id: 55, op: "create" },
      { strava: fakeStrava, db }
    );
    expect(result).toBe("dropped");

    const actRow = await admin
      .from("activities")
      .select("id")
      .eq("user_id", userId)
      .eq("strava_activity_id", 55);
    expect(actRow.data?.length ?? 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Refresh-on-use: expired token triggers refresh
  // -------------------------------------------------------------------------
  it("refresh-on-use: expired token is refreshed before fetching activity", async () => {
    const userId = await createTestUser("ingest-refresh");
    created.push(userId);

    const admin = svc();
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });

    // Attach connection with PAST expires_at
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "9003",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2020-01-01T00:00:00Z", // past!
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    const fakeStrava = new FakeStravaClient({
      activities: { 66: makeRunActivity(66) },
      pages: [],
      refreshedTokens: {
        accessToken: "NEW-AT",
        refreshToken: "NEW-RT",
        expiresAt: "2031-01-01T00:00:00Z",
      },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const result = await processIngestJob(
      { user_id: userId, strava_activity_id: 66, op: "create" },
      { strava: fakeStrava, db }
    );
    expect(result).toBe("ingested");

    // Verify refresh was called
    expect(fakeStrava.refreshCalled).toBe(true);

    // Verify stored token changed (decrypt the stored access_token; should NOT be "AT")
    const connRow = await admin
      .from("connections")
      .select("access_token")
      .eq("user_id", userId)
      .eq("provider", "strava")
      .single();
    expect(connRow.error).toBeNull();
    const decRes = await admin.rpc("decrypt_token", {
      cipher: connRow.data!.access_token,
    });
    expect(decRes.data).not.toBe("AT");
  });

  // -------------------------------------------------------------------------
  // 4. Delete op
  // -------------------------------------------------------------------------
  it("delete op: returns 'deleted' and sets deleted_at", async () => {
    const userId = await createTestUser("ingest-del");
    created.push(userId);

    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });

    // Seed an existing activity directly
    const insertRes = await admin.from("activities").insert({
      user_id: userId,
      strava_activity_id: 77,
      type: "Run",
      start_time: "2026-06-01T07:00:00Z",
      timezone: "UTC",
      distance_m: 5000,
      moving_time_s: 1500,
      elapsed_time_s: 1600,
    });
    expect(insertRes.error).toBeNull();

    const fakeStrava = new FakeStravaClient({
      activities: {},
      pages: [],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const result = await processIngestJob(
      { user_id: userId, strava_activity_id: 77, op: "delete" },
      { strava: fakeStrava, db }
    );
    expect(result).toBe("deleted");

    // deleted_at should be set
    const actRow = await admin
      .from("activities")
      .select("deleted_at")
      .eq("user_id", userId)
      .eq("strava_activity_id", 77)
      .single();
    expect(actRow.data!.deleted_at).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. Drain
  // -------------------------------------------------------------------------
  it("drain: processes ingest_queue messages end-to-end", async () => {
    const userId = await createTestUser("ingest-drain");
    created.push(userId);

    const admin = svc();
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "9004",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    // Enqueue via enqueue_strava_ingest (the same path a DB webhook would use)
    const enqRes = await admin.rpc("enqueue_strava_ingest", {
      p_athlete_id: "9004",
      p_strava_activity_id: 88,
      p_op: "create",
    });
    expect(enqRes.data).toBe(true);

    const fakeStrava = new FakeStravaClient({
      activities: { 88: makeRunActivity(88) },
      pages: [],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const count = await drainIngestQueue({ strava: fakeStrava, db });
    expect(count).toBeGreaterThanOrEqual(1);

    // Activity 88 should be ingested
    const actRow = await admin
      .from("activities")
      .select("id")
      .eq("user_id", userId)
      .eq("strava_activity_id", 88)
      .single();
    expect(actRow.error).toBeNull();

    // ingest_queue should be empty for this message (we acked it)
    const qRead = await admin.rpc("pgmq_read", {
      queue_name: "ingest_queue",
      vt: 1,
      qty: 100,
    });
    const remaining = (
      qRead.data as Array<{ message: Record<string, unknown> }>
    ).filter((m) => m.message["user_id"] === userId && m.message["strava_activity_id"] === 88);
    expect(remaining.length).toBe(0);
  });
});
