import { describe, it, expect } from "vitest";
import { app } from "./index";

describe("worker app", () => {
  it("GET /healthz returns 200 ok", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
