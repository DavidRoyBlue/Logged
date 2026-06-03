import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";
describe("mark_missed_plans", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });
  it("flips old pending plans to missed; leaves recent pending and completed alone", async () => {
    const svc = serviceClient(); const a = await userClient(`mp-${Date.now()}@t.dev`); created.push(a.userId);
    await svc.from("profiles").upsert({ id: a.userId });
    const old = await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2020-01-01", title: "Old", status: "pending" }).select("id").single();
    const recent = await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: new Date(Date.now()+86400000).toISOString().slice(0,10), title: "Future", status: "pending" }).select("id").single();
    const done = await svc.from("planned_sessions").insert({ user_id: a.userId, type: "Run", planned_date: "2020-01-01", title: "Done", status: "completed" }).select("id").single();
    await svc.rpc("mark_missed_plans");
    const o = await svc.from("planned_sessions").select("status").eq("id", old.data!.id).single();
    const r = await svc.from("planned_sessions").select("status").eq("id", recent.data!.id).single();
    const d = await svc.from("planned_sessions").select("status").eq("id", done.data!.id).single();
    expect(o.data!.status).toBe("missed");
    expect(r.data!.status).toBe("pending");
    expect(d.data!.status).toBe("completed");
  });
});
