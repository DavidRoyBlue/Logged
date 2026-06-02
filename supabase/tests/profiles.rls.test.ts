import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("profiles RLS", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("a user can read their own profile but not another's", async () => {
    const a = await userClient(`a-${Date.now()}@t.dev`); created.push(a.userId);
    const b = await userClient(`b-${Date.now()}@t.dev`); created.push(b.userId);
    const svc = serviceClient();
    await svc.from("profiles").upsert([{ id: a.userId }, { id: b.userId }]);

    const own = await a.client.from("profiles").select("id").eq("id", a.userId);
    expect(own.data).toHaveLength(1);
    const other = await a.client.from("profiles").select("id").eq("id", b.userId);
    expect(other.data).toHaveLength(0);
  });
});
