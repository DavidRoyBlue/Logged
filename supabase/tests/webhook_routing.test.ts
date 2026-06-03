import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("webhook routing SQL", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("enqueue_strava_ingest enqueues for an active connection and returns true", async () => {
    const svc = serviceClient(); const a = await userClient(`wr-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    await svc.from("connections").insert({ user_id: a.userId, provider: "strava", external_account_id: "9001", status: "active" });
    const r = await svc.rpc("enqueue_strava_ingest", { p_athlete_id: "9001", p_strava_activity_id: 42, p_op: "create" });
    expect(r.data).toBe(true);
    const read = await svc.rpc("pgmq_read", { queue_name: "ingest_queue", vt: 2, qty: 20 });
    expect((read.data as any[]).some((m) => m.message.strava_activity_id === 42 && m.message.user_id === a.userId)).toBe(true);
  });

  it("enqueue_strava_ingest returns false and does NOT enqueue for revoked/unknown athlete", async () => {
    const svc = serviceClient(); const a = await userClient(`wr2-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    await svc.from("connections").insert({ user_id: a.userId, provider: "strava", external_account_id: "7777", status: "revoked" });
    const r = await svc.rpc("enqueue_strava_ingest", { p_athlete_id: "7777", p_strava_activity_id: 99, p_op: "create" });
    expect(r.data).toBe(false);
    const unknown = await svc.rpc("enqueue_strava_ingest", { p_athlete_id: "does-not-exist", p_strava_activity_id: 1, p_op: "create" });
    expect(unknown.data).toBe(false);
  });

  it("handle_strava_deauth revokes the connection", async () => {
    const svc = serviceClient(); const a = await userClient(`wr3-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    await svc.from("connections").insert({ user_id: a.userId, provider: "strava", external_account_id: "5555", status: "active" });
    await svc.rpc("handle_strava_deauth", { p_athlete_id: "5555" });
    const c = await svc.from("connections").select("status").eq("user_id", a.userId).eq("provider", "strava").single();
    expect(c.data!.status).toBe("revoked");
  });

  it("soft_delete_activity soft-deletes, un-matches the plan, and enqueues a revert", async () => {
    const svc = serviceClient(); const a = await userClient(`wr4-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    const act = await svc.from("activities").insert({ user_id: a.userId, strava_activity_id: 808, type: "Run", start_time: "2026-05-02T07:00:00Z", timezone: "UTC", distance_m: 5000, moving_time_s: 1500, elapsed_time_s: 1500 }).select("id").single();
    const plan = await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2026-05-02", title: "Tempo", status: "completed", matched_activity_id: act.data!.id }).select("id").single();
    const conn = await svc.from("connections").insert({ user_id: a.userId, provider: "notion", status: "active" }).select("id").single();
    await svc.from("outbound_records").insert({ user_id: a.userId, activity_id: act.data!.id, connection_id: conn.data!.id, action: "completed_plan", status: "ok" });

    await svc.rpc("soft_delete_activity", { p_user_id: a.userId, p_strava_activity_id: 808 });

    const ar = await svc.from("activities").select("deleted_at").eq("id", act.data!.id).single();
    expect(ar.data!.deleted_at).not.toBeNull();
    const pr = await svc.from("planned_sessions").select("status, matched_activity_id").eq("id", plan.data!.id).single();
    expect(pr.data!.status).toBe("pending");
    expect(pr.data!.matched_activity_id).toBeNull();
    const read = await svc.rpc("pgmq_read", { queue_name: "plan_push_queue", vt: 2, qty: 50 });
    expect((read.data as any[]).some((m) => m.message.op === "revert" && m.message.plan_id === plan.data!.id)).toBe(true);
  });
});
