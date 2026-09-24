/**
 * Integration tests for the sync worker.
 * Runs against the live local Supabase instance.
 * Uses fake adapters (CalendarAdapter + NotionAdapter wrapping FakeCalendarClient/FakeNotionClient).
 * NO real network calls to Google Calendar or Notion.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor,
} from "@supabase/supabase-js";
import ws from "ws";
import { processSyncJob } from "./sync";
import { Db } from "./db";
import { CalendarAdapter, FakeCalendarClient } from "./adapters/calendar";
import { NotionAdapter, FakeNotionClient } from "./adapters/notion";

// `ws`'s WebSocket has an overloaded constructor (a `null`-only signature for
// server mode); realtime-js's WebSocketLikeConstructor only models the client
// signature, so a direct assignment doesn't structurally match.
const wsTransport = ws as unknown as WebSocketLikeConstructor;

// ---------------------------------------------------------------------------
// Supabase client helpers
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
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
  const email = `${emailPrefix}-${Date.now()}@sync-test.dev`;
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

/** Insert an activity row directly (service role, bypass RLS) */
async function insertActivity(
  userId: string,
  stravaActivityId: number,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const admin = svc();
  const row = {
    user_id: userId,
    strava_activity_id: stravaActivityId,
    type: "Run",
    start_time: "2026-05-02T12:00:00Z",
    timezone: "UTC",
    distance_m: 10000,
    moving_time_s: 3000,
    elapsed_time_s: 3100,
    avg_pace_s_per_km: 300,
    avg_hr: 150,
    max_hr: 170,
    elevation_gain_m: 50,
    calories: 600,
    name: "Test Run",
    workout_type: null,
    zone_distribution: null,
    ...overrides,
  };
  const { data, error } = await admin
    .from("activities")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`insertActivity: ${error.message}`);
  return data.id as string;
}

/** Insert a pending planned_session row */
async function insertPlan(
  userId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const admin = svc();
  const row = {
    user_id: userId,
    type: "Run",
    planned_date: "2026-05-02",
    target_distance_m: 10000,
    title: "Test Plan",
    status: "pending",
    ...overrides,
  };
  const { data, error } = await admin
    .from("planned_sessions")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`insertPlan: ${error.message}`);
  return data.id as string;
}

/** Attach a non-strava connection (google_calendar or notion) */
async function attachOutboundConnection(
  userId: string,
  provider: "google_calendar" | "notion"
): Promise<string> {
  const admin = svc();
  const { data, error } = await admin
    .from("connections")
    .insert({
      user_id: userId,
      provider,
      status: "active",
      config: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`attachOutboundConnection(${provider}): ${error.message}`);
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("sync worker integration", () => {
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
  // 1. Match path: completed_plan → outbound fan-out to both connections
  // -------------------------------------------------------------------------
  it("match path: completed_plan, outbound=2; plan completed; fake adapter calls recorded", async () => {
    const userId = await createTestUser("sync-match");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });

    // Create connections
    await attachOutboundConnection(userId, "google_calendar");
    await attachOutboundConnection(userId, "notion");

    // Insert activity
    const stravaId = 10001;
    await insertActivity(userId, stravaId);

    // Insert matching plan
    const planId = await insertPlan(userId, {
      type: "Run",
      planned_date: "2026-05-02",
      target_distance_m: 10000,
    });

    // Build fake adapters
    const fakeCalClient = new FakeCalendarClient();
    const fakeNotionClient = new FakeNotionClient();
    const adapters = {
      google_calendar: new CalendarAdapter(fakeCalClient),
      notion: new NotionAdapter(fakeNotionClient),
    };

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processSyncJob(
      { user_id: userId, strava_activity_id: stravaId },
      { db, adapters }
    );

    // Return value
    expect(result.action).toBe("completed_plan");
    expect(result.outbound).toBe(2);

    // Plan row should be completed
    const planRow = await admin
      .from("planned_sessions")
      .select("status, matched_activity_id")
      .eq("id", planId)
      .single();
    expect(planRow.error).toBeNull();
    expect(planRow.data!.status).toBe("completed");
    expect(planRow.data!.matched_activity_id).not.toBeNull();

    // Two outbound_records rows with status 'ok' and action 'completed_plan'
    const outboundRows = await admin
      .from("outbound_records")
      .select("*")
      .eq("user_id", userId)
      .order("synced_at");
    expect(outboundRows.error).toBeNull();
    expect(outboundRows.data).toHaveLength(2);
    for (const row of outboundRows.data!) {
      expect(row.status).toBe("ok");
      expect(row.action).toBe("completed_plan");
    }

    // Fake clients: each should have received a create or update call
    // For completed_plan with null existingRef (no calendar_event_id on plan), both create
    const calCalls = fakeCalClient.created.length + fakeCalClient.updated.length;
    expect(calCalls).toBe(1);
    const notionCalls = fakeNotionClient.created.length + fakeNotionClient.updated.length;
    expect(notionCalls).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 2. Idempotent re-run: outbound=0; no duplicate outbound_records
  // -------------------------------------------------------------------------
  it("idempotent re-run: second processSyncJob call returns outbound=0, no new records", async () => {
    const userId = await createTestUser("sync-idempotent");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });

    await attachOutboundConnection(userId, "google_calendar");
    await attachOutboundConnection(userId, "notion");

    const stravaId = 10002;
    await insertActivity(userId, stravaId);
    await insertPlan(userId, {
      type: "Run",
      planned_date: "2026-05-02",
      target_distance_m: 10000,
    });

    const fakeCalClient1 = new FakeCalendarClient();
    const fakeNotionClient1 = new FakeNotionClient();
    const adapters1 = {
      google_calendar: new CalendarAdapter(fakeCalClient1),
      notion: new NotionAdapter(fakeNotionClient1),
    };
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    // First run
    const first = await processSyncJob(
      { user_id: userId, strava_activity_id: stravaId },
      { db, adapters: adapters1 }
    );
    expect(first.outbound).toBe(2);

    // Second run with fresh fake clients
    const fakeCalClient2 = new FakeCalendarClient();
    const fakeNotionClient2 = new FakeNotionClient();
    const adapters2 = {
      google_calendar: new CalendarAdapter(fakeCalClient2),
      notion: new NotionAdapter(fakeNotionClient2),
    };

    const second = await processSyncJob(
      { user_id: userId, strava_activity_id: stravaId },
      { db, adapters: adapters2 }
    );
    expect(second.outbound).toBe(0);

    // Still exactly 2 outbound_records (no duplicates)
    const outboundRows = await admin
      .from("outbound_records")
      .select("id")
      .eq("user_id", userId);
    expect(outboundRows.error).toBeNull();
    expect(outboundRows.data).toHaveLength(2);

    // Second-run fake clients received no calls
    expect(fakeCalClient2.created.length + fakeCalClient2.updated.length).toBe(0);
    expect(fakeNotionClient2.created.length + fakeNotionClient2.updated.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. logged_new path: no matching plan → action 'logged_new'; plans untouched
  // -------------------------------------------------------------------------
  it("logged_new path: no matching plan → action logged_new; outbound_records action=logged_new", async () => {
    const userId = await createTestUser("sync-lognew");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });

    await attachOutboundConnection(userId, "google_calendar");
    await attachOutboundConnection(userId, "notion");

    // Activity with no matching plan (different date/type won't match)
    const stravaId = 10003;
    await insertActivity(userId, stravaId, {
      start_time: "2026-03-15T06:00:00Z", // far from any plans
      type: "Run",
      distance_m: 5000,
    });

    // Insert a plan that does NOT match (different date)
    const planId = await insertPlan(userId, {
      type: "Run",
      planned_date: "2026-05-02",
      target_distance_m: 10000,
    });

    const fakeCalClient = new FakeCalendarClient();
    const fakeNotionClient = new FakeNotionClient();
    const adapters = {
      google_calendar: new CalendarAdapter(fakeCalClient),
      notion: new NotionAdapter(fakeNotionClient),
    };
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processSyncJob(
      { user_id: userId, strava_activity_id: stravaId },
      { db, adapters }
    );

    expect(result.action).toBe("logged_new");
    expect(result.outbound).toBe(2);

    // Plan row untouched (still pending)
    const planRow = await admin
      .from("planned_sessions")
      .select("status")
      .eq("id", planId)
      .single();
    expect(planRow.data!.status).toBe("pending");

    // outbound_records should have action='logged_new'
    const outboundRows = await admin
      .from("outbound_records")
      .select("action, status")
      .eq("user_id", userId);
    expect(outboundRows.data).toHaveLength(2);
    for (const row of outboundRows.data!) {
      expect(row.action).toBe("logged_new");
      expect(row.status).toBe("ok");
    }
  });

  // -------------------------------------------------------------------------
  // 4. skipped path: activity not found → action 'skipped', outbound=0
  // -------------------------------------------------------------------------
  it("skipped path: activity not found → returns skipped", async () => {
    const userId = await createTestUser("sync-skip");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processSyncJob(
      { user_id: userId, strava_activity_id: 99999 },
      { db, adapters: {} }
    );

    expect(result.action).toBe("skipped");
    expect(result.outbound).toBe(0);
  });
});
