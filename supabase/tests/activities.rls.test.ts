import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("activities", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("enforces per-user dedup on strava_activity_id and isolates rows by RLS", async () => {
    const a = await userClient(`act-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert({ id: a.userId });

    const base = { user_id: a.userId, strava_activity_id: 9001, type: "Run",
      start_time: "2026-05-01T07:00:00Z", timezone: "UTC", distance_m: 5000, moving_time_s: 1500, elapsed_time_s: 1500 };
    const first = await svc.from("activities").insert(base);
    expect(first.error).toBeNull();
    const dup = await svc.from("activities").insert(base);
    expect(dup.error).not.toBeNull(); // unique (user_id, strava_activity_id)

    const seen = await a.client.from("activities").select("strava_activity_id");
    expect(seen.data).toHaveLength(1);
  });
});
