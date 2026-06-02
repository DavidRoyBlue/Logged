import { describe, it, expect } from "vitest";
import { serviceClient } from "./helpers";

describe("pgmq queues", () => {
  it("ingest_queue accepts and returns a message", async () => {
    const svc = serviceClient();
    const send = await svc.rpc("pgmq_send", { queue_name: "ingest_queue", msg: { user_id: "u1", strava_activity_id: 1 } as any });
    expect(send.error).toBeNull();
    const read = await svc.rpc("pgmq_read", { queue_name: "ingest_queue", vt: 5, qty: 1 });
    expect(read.error).toBeNull();
    expect((read.data as any[]).length).toBe(1);
  });
});
