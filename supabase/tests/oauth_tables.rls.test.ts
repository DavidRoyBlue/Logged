import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("oauth_states / auth_handoffs are service-role only", () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created) await cleanupUser(id); created.length = 0; });

  it("an authenticated user cannot read oauth_states or auth_handoffs", async () => {
    const a = await userClient(`oauth-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    await svc.from("oauth_states").insert({ state: "s1", provider: "strava" });
    await svc.from("auth_handoffs").insert({ code: "c1", user_id: a.userId });

    const states = await a.client.from("oauth_states").select("state");
    expect(states.data ?? []).toHaveLength(0);
    const handoffs = await a.client.from("auth_handoffs").select("code");
    expect(handoffs.data ?? []).toHaveLength(0);
  });
});
