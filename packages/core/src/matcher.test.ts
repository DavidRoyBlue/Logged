import { describe, it, expect } from "vitest";
import { withinWindow } from "./matcher";

describe("withinWindow", () => {
  it("true when plan date is within ±36h of the activity start", () => {
    expect(withinWindow("2026-05-02", "2026-05-02T07:00:00Z", 36)).toBe(true);
  });
  it("false when outside the window", () => {
    expect(withinWindow("2026-05-10", "2026-05-02T07:00:00Z", 36)).toBe(false);
  });
});
