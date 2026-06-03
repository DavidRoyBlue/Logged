/**
 * Integration tests for the backfill worker.
 * Runs against the live local Supabase instance.
 * Uses a FakeStravaClient — no real network calls to Strava.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processBackfill } from "./backfill";
import { FakeStravaClient } from "./strava";
import { Db } from "./db";

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
  });
}

async function createTestUser(emailPrefix: string): Promise<string> {
  const admin = svc();
  const email = `${emailPrefix}-${Date.now()}@backfill-test.dev`;
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
// Sample Strava summary activity payloads
// ---------------------------------------------------------------------------
function makeSummaryActivity(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "Morning Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3100,
    total_elevation_gain: 50,
    type: "Run",
    sport_type: "Run",
    start_date: "2026-05-01T07:00:00Z",
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

// Build 100 summary activities with distinct ids
function makePage(startId: number, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => makeSummaryActivity(startId + i));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("backfill worker integration", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const id of created) await cleanupUser(id);
    created.length = 0;
  });

  // -------------------------------------------------------------------------
  // 1. Two-page backfill
  // -------------------------------------------------------------------------
  it("two pages: imports 130 activities, sets done + cursor", async () => {
    const userId = await createTestUser("backfill-pages");
    created.push(userId);

    const admin = svc();
    // Seed profile (free tier) + zones + active strava connection
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "8001",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    // page 1 = 100 activities, page 2 = 30 activities, page 3 = [] (signals done)
    const page1 = makePage(1, 100);
    const page2 = makePage(101, 30);

    const fakeStrava = new FakeStravaClient({
      activities: {},
      pages: [page1, page2],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processBackfill(
      { user_id: userId, window: "90d", accessToken: "AT" },
      { strava: fakeStrava, db }
    );

    expect(result.imported).toBe(130);
    expect(result.window).toBe("90d");

    // Assert activities count
    const { count } = await admin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(130);

    // Profile: done + cursor set
    const { data: prof } = await admin
      .from("profiles")
      .select("backfill_status, backfill_cursor")
      .eq("id", userId)
      .single();
    expect(prof!.backfill_status).toBe("done");
    expect(prof!.backfill_cursor).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Idempotent re-run
  // -------------------------------------------------------------------------
  it("idempotent re-run: still 130 activities after second processBackfill", async () => {
    const userId = await createTestUser("backfill-idem");
    created.push(userId);

    const admin = svc();
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "8002",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    const page1 = makePage(1, 100);
    const page2 = makePage(101, 30);

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    // First run
    await processBackfill(
      { user_id: userId, window: "90d", accessToken: "AT" },
      {
        strava: new FakeStravaClient({
          activities: {},
          pages: [page1, page2],
          refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
        }),
        db,
      }
    );

    // Second run — same pages again
    const page1b = makePage(1, 100);
    const page2b = makePage(101, 30);
    const result2 = await processBackfill(
      { user_id: userId, window: "90d", accessToken: "AT" },
      {
        strava: new FakeStravaClient({
          activities: {},
          pages: [page1b, page2b],
          refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
        }),
        db,
      }
    );

    expect(result2.imported).toBe(130);

    // Still only 130 distinct activities (upsert, no duplicates)
    const { count } = await admin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(130);
  });

  // -------------------------------------------------------------------------
  // 3. Tier-gate: free user requesting "full" → clamped to "90d"
  // -------------------------------------------------------------------------
  it("tier-gate free: full request clamped to 90d with afterEpoch applied", async () => {
    const userId = await createTestUser("backfill-tiergate-free");
    created.push(userId);

    const admin = svc();
    // free tier (default)
    await admin.from("profiles").upsert({ id: userId, athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "8003",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    const fakeStrava = new FakeStravaClient({
      activities: {},
      pages: [], // no activities needed for tier-gate test
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processBackfill(
      { user_id: userId, window: "full", accessToken: "AT" },
      { strava: fakeStrava, db }
    );

    // Window clamped to 90d
    expect(result.window).toBe("90d");
    // afterEpoch must NOT be undefined (a 90d lower bound was applied)
    expect(fakeStrava.lastAfterEpoch).not.toBeUndefined();
    expect(typeof fakeStrava.lastAfterEpoch).toBe("number");
  });

  // -------------------------------------------------------------------------
  // 4. Tier-gate: pro user requesting "full" → not clamped, afterEpoch undefined
  // -------------------------------------------------------------------------
  it("tier-gate pro: full request not clamped, afterEpoch undefined", async () => {
    const userId = await createTestUser("backfill-tiergate-pro");
    created.push(userId);

    const admin = svc();
    // Explicitly set pro tier
    await admin.from("profiles").upsert({ id: userId, tier: "pro", athlete_zones: ATHLETE_ZONES });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "8004",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    const fakeStrava = new FakeStravaClient({
      activities: {},
      pages: [],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processBackfill(
      { user_id: userId, window: "full", accessToken: "AT" },
      { strava: fakeStrava, db }
    );

    // Window stays full
    expect(result.window).toBe("full");
    // afterEpoch must be undefined (no lower bound)
    expect(fakeStrava.lastAfterEpoch).toBeUndefined();
  });
});
