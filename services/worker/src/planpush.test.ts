/**
 * Integration tests for the plan-push worker.
 * Runs against the live local Supabase instance.
 * Adapters are FAKE — no real network calls.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processPlanPush } from "./planpush";
import { Db } from "./db";
import { NotionAdapter, FakeNotionClient } from "./adapters/notion";

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
  const email = `${emailPrefix}-${Date.now()}@planpush-test.dev`;
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

/** Attach an active notion outbound connection */
async function attachNotionConnection(userId: string): Promise<string> {
  const admin = svc();
  const { data, error } = await admin
    .from("connections")
    .insert({
      user_id: userId,
      provider: "notion",
      status: "active",
      config: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`attachNotionConnection: ${error.message}`);
  return data.id as string;
}

/** Insert a pending plan with no external refs */
async function insertPlan(
  userId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const admin = svc();
  const row = {
    user_id: userId,
    type: "Run",
    planned_date: "2026-06-10",
    target_distance_m: 10000,
    title: "Morning 10k",
    description: "Easy run",
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("processPlanPush integration", () => {
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
  // 1. create: pushes plan to notion; stores notion_page_id; touched=1
  // -------------------------------------------------------------------------
  it("create: pushes to notion, stores notion_page_id, touched=1", async () => {
    const userId = await createTestUser("planpush-create");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });
    await attachNotionConnection(userId);

    const planId = await insertPlan(userId);

    const fakeNotion = new FakeNotionClient();
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processPlanPush(
      { user_id: userId, plan_id: planId, op: "create" },
      { db, adapters: { notion: new NotionAdapter(fakeNotion) } }
    );

    expect(result.op).toBe("create");
    expect(result.touched).toBe(1);

    // fakeNotion.createPage was called once
    expect(fakeNotion.created).toHaveLength(1);
    const createdProps = fakeNotion.created[0]!.props;
    expect(createdProps["Name"]).toBe("Morning 10k");
    expect(createdProps["Date"]).toBe("2026-06-10");
    expect(createdProps["Type"]).toBe("Run");
    expect(createdProps["Status"]).toBe("pending");
    expect(createdProps["Target Distance"]).toBe(10000);

    // notion_page_id stored in the plan row
    const planRow = await admin
      .from("planned_sessions")
      .select("notion_page_id")
      .eq("id", planId)
      .single();
    expect(planRow.error).toBeNull();
    expect(planRow.data!.notion_page_id).toBe("notion-0");
  });

  // -------------------------------------------------------------------------
  // 2. create idempotent: skip if notion_page_id already set
  // -------------------------------------------------------------------------
  it("create idempotent: skips push if notion_page_id already set, touched=0", async () => {
    const userId = await createTestUser("planpush-create-idem");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });
    await attachNotionConnection(userId);

    // Plan already has a notion_page_id
    const planId = await insertPlan(userId, { notion_page_id: "existing-notion-123" });

    const fakeNotion = new FakeNotionClient();
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processPlanPush(
      { user_id: userId, plan_id: planId, op: "create" },
      { db, adapters: { notion: new NotionAdapter(fakeNotion) } }
    );

    expect(result.touched).toBe(0);
    expect(fakeNotion.created).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. revert: un-completes the plan in notion (updatePage), touched=1
  // -------------------------------------------------------------------------
  it("revert: calls updatePage on existing ref to un-complete; touched=1", async () => {
    const userId = await createTestUser("planpush-revert");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });
    await attachNotionConnection(userId);

    // Plan with an existing notion_page_id
    const planId = await insertPlan(userId, { notion_page_id: "notion-page-abc" });

    const fakeNotion = new FakeNotionClient();
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processPlanPush(
      { user_id: userId, plan_id: planId, op: "revert" },
      { db, adapters: { notion: new NotionAdapter(fakeNotion) } }
    );

    expect(result.op).toBe("revert");
    expect(result.touched).toBe(1);

    // revert calls adapter.revert which calls updatePage (un-complete)
    expect(fakeNotion.updated).toHaveLength(1);
    expect(fakeNotion.updated[0]!.id).toBe("notion-page-abc");
    expect(fakeNotion.updated[0]!.props["Status"]).toBe("pending");

    // Plan row still exists (revert does NOT delete)
    const planRow = await admin
      .from("planned_sessions")
      .select("id")
      .eq("id", planId)
      .single();
    expect(planRow.error).toBeNull();
    expect(planRow.data).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. delete: archives external, then deletes the plan row; touched=1
  // -------------------------------------------------------------------------
  it("delete: archives notion page, removes planned_sessions row; touched=1", async () => {
    const userId = await createTestUser("planpush-delete");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });
    await attachNotionConnection(userId);

    const planId = await insertPlan(userId, { notion_page_id: "notion-page-del" });

    const fakeNotion = new FakeNotionClient();
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processPlanPush(
      { user_id: userId, plan_id: planId, op: "delete" },
      { db, adapters: { notion: new NotionAdapter(fakeNotion) } }
    );

    expect(result.op).toBe("delete");
    expect(result.touched).toBe(1);

    // fakeNotion.archivePage was called
    expect(fakeNotion.archived).toHaveLength(1);
    expect(fakeNotion.archived[0]).toBe("notion-page-del");

    // planned_sessions row is gone
    const planRow = await admin
      .from("planned_sessions")
      .select("id")
      .eq("id", planId)
      .maybeSingle();
    expect(planRow.error).toBeNull();
    expect(planRow.data).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. delete with no plan row: returns touched=0, no error
  // -------------------------------------------------------------------------
  it("delete with missing plan row: returns touched=0 without error", async () => {
    const userId = await createTestUser("planpush-delete-miss");
    created.push(userId);
    const admin = svc();
    await admin.from("profiles").upsert({ id: userId });
    await attachNotionConnection(userId);

    const fakeNotion = new FakeNotionClient();
    const db = new Db({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

    const result = await processPlanPush(
      { user_id: userId, plan_id: "00000000-0000-0000-0000-000000000000", op: "delete" },
      { db, adapters: { notion: new NotionAdapter(fakeNotion) } }
    );

    expect(result.op).toBe("delete");
    expect(result.touched).toBe(0);
    expect(fakeNotion.archived).toHaveLength(0);
  });
});
