import { describe, it, expect, afterEach } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("oauth_states / auth_handoffs are service-role only", () => {
  const created: string[] = [];
  const stateKeys: string[] = [];
  afterEach(async () => {
    const svc = serviceClient();
    for (const s of stateKeys) await svc.from("oauth_states").delete().eq("state", s);
    stateKeys.length = 0;
    for (const id of created) await cleanupUser(id);
    created.length = 0;
  });

  it("an authenticated user cannot read oauth_states or auth_handoffs", async () => {
    const a = await userClient(`oauth-${Date.now()}@t.dev`); created.push(a.userId);
    const svc = serviceClient();
    const state = `s1-${Date.now()}`; stateKeys.push(state);
    const code = `c1-${Date.now()}`;

    const { error: insErr1 } = await svc.from("oauth_states").insert({ state, provider: "strava" });
    expect(insErr1).toBeNull();
    const { error: insErr2 } = await svc.from("auth_handoffs").insert({ code, user_id: a.userId });
    expect(insErr2).toBeNull();

    // Prove the rows exist via the service role, so the user's empty result is attributable to RLS.
    const svcStates = await svc.from("oauth_states").select("state").eq("state", state);
    expect(svcStates.data).toHaveLength(1);
    const svcHandoffs = await svc.from("auth_handoffs").select("code").eq("code", code);
    expect(svcHandoffs.data).toHaveLength(1);

    // The authenticated user must be denied by RLS (no policies => default-deny).
    const states = await a.client.from("oauth_states").select("state");
    expect(states.data ?? []).toHaveLength(0);
    const handoffs = await a.client.from("auth_handoffs").select("code");
    expect(handoffs.data ?? []).toHaveLength(0);
  });
});
