import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("connections RLS", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("a user reads only their own connections", async () => {
    const a = await userClient(`ca-${Date.now()}@t.dev`); created.push(a.userId);
    const b = await userClient(`cb-${Date.now()}@t.dev`); created.push(b.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert([{ id: a.userId }, { id: b.userId }]);
    await svc.from("connections").insert([
      { user_id: a.userId, provider: "strava", external_account_id: "111", status: "active" },
      { user_id: b.userId, provider: "strava", external_account_id: "222", status: "active" },
    ]);
    const rows = await a.client.from("connections").select("external_account_id");
    expect(rows.data?.map((r) => r.external_account_id)).toEqual(["111"]);
  });
});
