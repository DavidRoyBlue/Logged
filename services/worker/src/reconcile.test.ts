/**
 * Integration test for reconcileUser worker function.
 * Runs against the live local Supabase instance.
 * Strava is fully faked — no real network calls.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { reconcileUser } from "./reconcile";
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
  const email = `${emailPrefix}-${Date.now()}@reconcile-test.dev`;
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
// Test suite
// ---------------------------------------------------------------------------
describe("reconcileUser integration", () => {
  const created: string[] = [];

  beforeEach(async () => {
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    await db.purgeAllQueues();
  });

  afterEach(async () => {
    for (const id of created) await cleanupUser(id);
    created.length = 0;
  });

  it("enqueues only activities not already in DB; skips already-ingested ones", async () => {
    const userId = await createTestUser("reconcile-gap");
    created.push(userId);

    const admin = svc();

    // Seed profile + active strava connection
    await admin.from("profiles").upsert({ id: userId });
    await admin.rpc("attach_connection", {
      p_user_id: userId,
      p_provider: "strava",
      p_external_account_id: "rc-001",
      p_access: "AT",
      p_refresh: "RT",
      p_expires: "2030-01-01T00:00:00Z",
      p_scopes: "read",
      p_status: "active",
      p_config: {},
    });

    // Seed activity id=1 as already ingested (not deleted)
    await admin.from("activities").insert({
      user_id: userId,
      strava_activity_id: 1,
      type: "Run",
      start_time: "2026-06-01T07:00:00Z",
      timezone: "UTC",
      distance_m: 5000,
      moving_time_s: 1500,
      elapsed_time_s: 1600,
    });

    // FakeStravaClient returns summaries with ids [1, 2]
    const fakeStrava = new FakeStravaClient({
      activities: {},
      pages: [
        [
          { id: 1, name: "Run A", type: "Run" },
          { id: 2, name: "Run B", type: "Run" },
        ],
      ],
      refreshedTokens: { accessToken: "X", refreshToken: "Y", expiresAt: null },
    });

    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await reconcileUser(userId, "AT", { strava: fakeStrava, db });

    // Only id=2 should be enqueued (id=1 already exists)
    expect(result.enqueued).toBe(1);

    // Read ingest_queue and verify id=2 is present, id=1 is not
    const qRead = await admin.rpc("pgmq_read", {
      queue_name: "ingest_queue",
      vt: 30,
      qty: 100,
    });
    expect(qRead.error).toBeNull();

    const messages = (qRead.data as Array<{ message: Record<string, unknown> }>)
      .filter((m) => m.message["user_id"] === userId)
      .map((m) => m.message["strava_activity_id"]);

    expect(messages).toContain(2);
    expect(messages).not.toContain(1);
  });
});
