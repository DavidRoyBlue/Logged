import { describe, it, expect } from "vitest";
import { computePaceSPerKm } from "./normalize";

describe("computePaceSPerKm", () => {
  it("returns seconds per km from distance + moving time", () => {
    expect(computePaceSPerKm(5000, 1500)).toBe(300);
  });
  it("returns null for zero distance", () => {
    expect(computePaceSPerKm(0, 1500)).toBeNull();
  });
});
