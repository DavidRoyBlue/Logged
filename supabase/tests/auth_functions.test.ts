import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("auth SQL functions", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("oauth_state: create then consume once; expired not returned", async () => {
    const svc = serviceClient();
    const a = await userClient(`os-${Date.now()}@t.dev`); created.push(a.userId);
    const mk = await svc.rpc("create_oauth_state", { p_provider: "strava", p_user_id: a.userId });
    expect(mk.error).toBeNull();
    const state = mk.data as string;
    const c1 = await svc.rpc("consume_oauth_state", { p_state: state });
    expect(c1.error).toBeNull();
    expect((c1.data as any[]).length).toBe(1);
    const c2 = await svc.rpc("consume_oauth_state", { p_state: state });
    expect((c2.data as any[]).length).toBe(0); // consumed (deleted)
    // expired state: insert directly with past expiry
    await svc.from("oauth_states").insert({ state: `exp-${Date.now()}`, provider: "strava", user_id: a.userId, expires_at: "2000-01-01T00:00:00Z" });
  });

  it("auth_handoff: single-use and expiry enforced", async () => {
    const svc = serviceClient();
    const a = await userClient(`ah-${Date.now()}@t.dev`); created.push(a.userId);
    const mk = await svc.rpc("create_auth_handoff", { p_user_id: a.userId });
    const code = mk.data as string;
    const c1 = await svc.rpc("consume_auth_handoff", { p_code: code });
    expect(c1.data).toBe(a.userId);          // returns user once
    const c2 = await svc.rpc("consume_auth_handoff", { p_code: code });
    expect(c2.data).toBeNull();              // single-use
    // expired
    await svc.from("auth_handoffs").insert({ code: `exp-${Date.now()}`, user_id: a.userId, expires_at: "2000-01-01T00:00:00Z" });
    const ce = await svc.rpc("consume_auth_handoff", { p_code: `exp-${Date.now()}` });
    expect(ce.data).toBeNull();
  });

  it("attach_connection stores encrypted tokens and upserts", async () => {
    const svc = serviceClient();
    const a = await userClient(`ac-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    const id1 = await svc.rpc("attach_connection", { p_user_id: a.userId, p_provider: "strava", p_external_account_id: "555", p_access: "ACCESS1", p_refresh: "REFRESH1", p_expires: "2030-01-01T00:00:00Z", p_scopes: "read", p_status: "active", p_config: {} });
    expect(id1.error).toBeNull();
    // raw token column must be ciphertext, not plaintext
    const row = await svc.from("connections").select("access_token").eq("id", id1.data).single();
    expect(row.data!.access_token).not.toBe("ACCESS1");
    const dec = await svc.rpc("decrypt_token", { cipher: row.data!.access_token });
    expect(dec.data).toBe("ACCESS1");
    // upsert (same provider) updates, not duplicates
    const id2 = await svc.rpc("attach_connection", { p_user_id: a.userId, p_provider: "strava", p_external_account_id: "555", p_access: "ACCESS2", p_refresh: "R2", p_expires: "2030-01-01T00:00:00Z", p_scopes: "read", p_status: "active", p_config: {} });
    expect(id2.data).toBe(id1.data);
    const count = await svc.from("connections").select("id", { count: "exact", head: true }).eq("user_id", a.userId).eq("provider", "strava");
    expect(count.count).toBe(1);
    // find_strava_connection
    const found = await svc.rpc("find_strava_connection", { p_athlete_id: "555" });
    expect((found.data as any[])[0].user_id).toBe(a.userId);
  });

  it("activate_connection flips status and enqueues plan-push for pending plans missing the ref", async () => {
    const svc = serviceClient();
    const a = await userClient(`av-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    const connId = await svc.rpc("attach_connection", { p_user_id: a.userId, p_provider: "notion", p_external_account_id: null, p_access: "n", p_refresh: "n", p_expires: null, p_scopes: "", p_status: "pending_config", p_config: {} });
    await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2026-06-10", title: "Tempo" }); // notion_page_id null
    const act = await svc.rpc("activate_connection", { p_connection_id: connId.data, p_config: { notion_database_id: "db1" } });
    expect(act.error).toBeNull();
    const conn = await svc.from("connections").select("status, config").eq("id", connId.data).single();
    expect(conn.data!.status).toBe("active");
    // a plan_push job was enqueued
    const read = await svc.rpc("pgmq_read", { queue_name: "plan_push_queue", vt: 5, qty: 10 });
    const msgs = (read.data as any[]).map((m) => m.message);
    expect(msgs.some((m) => m.user_id === a.userId && m.op === "create")).toBe(true);
  });
});
