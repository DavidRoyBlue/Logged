import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("planned_sessions + outbound_records", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("enforces one outbound_record per (activity, connection) and isolates plans by RLS", async () => {
    const a = await userClient(`plan-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert({ id: a.userId });

    const conn = await svc.from("connections")
      .insert({ user_id: a.userId, provider: "notion", status: "active" }).select("id").single();
    const act = await svc.from("activities").insert({
      user_id: a.userId, strava_activity_id: 7777, type: "Run",
      start_time: "2026-05-02T07:00:00Z", timezone: "UTC", distance_m: 10000, moving_time_s: 3000, elapsed_time_s: 3000,
    }).select("id").single();

    const rec = { user_id: a.userId, activity_id: act.data!.id, connection_id: conn.data!.id, action: "logged_new", status: "ok" };
    const first = await svc.from("outbound_records").insert(rec);
    expect(first.error).toBeNull();
    const dup = await svc.from("outbound_records").insert(rec);
    expect(dup.error).not.toBeNull(); // unique (activity_id, connection_id)

    await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2026-05-02", title: "Easy 10k" });
    const mine = await a.client.from("planned_sessions").select("title");
    expect(mine.data).toEqual([{ title: "Easy 10k" }]);
  });
});
