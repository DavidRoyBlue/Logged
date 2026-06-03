/**
 * Pure unit tests for summarizeWeek.
 * No network, no RN environment needed — pure TS logic.
 */

import { summarizeWeek } from "./stats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal activity row at the given ISO timestamp. */
function act(start_time: string, distance_m: number, moving_time_s: number) {
  return { start_time, distance_m, moving_time_s };
}

// ---------------------------------------------------------------------------
// Fixtures
//
// Week under test: ISO week containing 2024-06-05 (Wednesday)
//   Monday    2024-06-03 00:00:00 UTC
//   Sunday    2024-06-09 23:59:59 UTC
//   Next Mon  2024-06-10 00:00:00 UTC  (exclusive upper bound)
//
// Prior week:
//   Monday    2024-05-27
//   Sunday    2024-06-02
// ---------------------------------------------------------------------------
const NOW = "2024-06-05T12:00:00.000Z"; // Wednesday, this week

// This-week activities
const ACT_THIS_WED = act("2024-06-05T08:00:00.000Z", 5000, 1500);
const ACT_THIS_MON = act("2024-06-03T00:00:01.000Z", 3000, 900); // just after Monday midnight

// Last-week activities
const ACT_LAST_SUN = act("2024-06-02T23:59:59.000Z", 4000, 1200); // just before Monday (last week)
const ACT_LAST_MON = act("2024-05-27T06:00:00.000Z", 2000, 600);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("summarizeWeek", () => {
  it("returns zeros and null delta for an empty activity list", () => {
    const result = summarizeWeek([], NOW);
    expect(result.distanceM).toBe(0);
    expect(result.movingTimeS).toBe(0);
    expect(result.count).toBe(0);
    expect(result.deltaDistancePct).toBeNull();
  });

  it("sums only this-week activities; delta is null when there are none last week", () => {
    const result = summarizeWeek([ACT_THIS_WED, ACT_THIS_MON], NOW);
    expect(result.distanceM).toBe(8000);
    expect(result.movingTimeS).toBe(2400);
    expect(result.count).toBe(2);
    expect(result.deltaDistancePct).toBeNull();
  });

  it("correctly computes deltaDistancePct with this-week and last-week data", () => {
    // this-week: 5000 m, last-week: 4000 m  → delta = (5000-4000)/4000 * 100 = 25
    const result = summarizeWeek([ACT_THIS_WED, ACT_LAST_SUN], NOW);
    expect(result.distanceM).toBe(5000);
    expect(result.count).toBe(1);
    expect(result.deltaDistancePct).toBeCloseTo(25, 5);
  });

  it("handles a negative delta (this week less than last week)", () => {
    // this-week: 3000 m, last-week: 6000 m → delta = (3000-6000)/6000 * 100 = -50
    const lastBig = act("2024-06-02T10:00:00.000Z", 6000, 1800);
    const result = summarizeWeek([ACT_THIS_MON, lastBig], NOW);
    expect(result.distanceM).toBe(3000);
    expect(result.deltaDistancePct).toBeCloseTo(-50, 5);
  });

  it("excludes activities from two or more weeks ago", () => {
    const twoWeeksAgo = act("2024-05-20T10:00:00.000Z", 9000, 2700); // two weeks prior
    const result = summarizeWeek([ACT_THIS_WED, twoWeeksAgo], NOW);
    expect(result.distanceM).toBe(5000);
    expect(result.deltaDistancePct).toBeNull(); // no last-week data
  });

  it("handles this-week + multiple last-week activities", () => {
    // last week total: 4000 + 2000 = 6000 m
    // this week: 5000 m → delta = (5000 - 6000) / 6000 * 100 ≈ -16.667
    const result = summarizeWeek(
      [ACT_THIS_WED, ACT_LAST_SUN, ACT_LAST_MON],
      NOW
    );
    expect(result.distanceM).toBe(5000);
    expect(result.deltaDistancePct).toBeCloseTo(-100 / 6, 4);
  });

  // ------------------------------------------------------------------
  // Week-boundary correctness
  // ------------------------------------------------------------------

  it("activity exactly at Monday 00:00:00 UTC belongs to THIS week", () => {
    const atBoundary = act("2024-06-03T00:00:00.000Z", 1000, 300);
    const result = summarizeWeek([atBoundary], NOW);
    expect(result.count).toBe(1);
    expect(result.distanceM).toBe(1000);
    expect(result.deltaDistancePct).toBeNull(); // no prior data
  });

  it("activity at the millisecond before Monday 00:00:00 UTC belongs to LAST week", () => {
    const justBefore = act("2024-06-02T23:59:59.999Z", 1000, 300);
    const result = summarizeWeek([justBefore], NOW);
    // this week: 0 activities → zeros, but last-week dist = 1000
    expect(result.count).toBe(0);
    expect(result.distanceM).toBe(0);
    // delta: last = 1000, this = 0 → (0 - 1000) / 1000 * 100 = -100
    expect(result.deltaDistancePct).toBeCloseTo(-100, 5);
  });

  it("activity at the start of next Monday 00:00:00 UTC is NOT in this week", () => {
    const nextMon = act("2024-06-10T00:00:00.000Z", 5000, 1500);
    const result = summarizeWeek([nextMon], NOW);
    expect(result.count).toBe(0);
    expect(result.distanceM).toBe(0);
    expect(result.deltaDistancePct).toBeNull();
  });

  it("works when nowIso is itself exactly Monday 00:00:00 UTC", () => {
    const monday = "2024-06-03T00:00:00.000Z";
    // An activity on the same Monday belongs in this (new) week
    const onMonday = act("2024-06-03T06:00:00.000Z", 2000, 600);
    // An activity on the prior Sunday belongs last week
    const lastSunday = act("2024-06-02T20:00:00.000Z", 3000, 900);
    const result = summarizeWeek([onMonday, lastSunday], monday);
    expect(result.count).toBe(1);
    expect(result.distanceM).toBe(2000);
    // delta: (2000 - 3000) / 3000 * 100 ≈ -33.333
    expect(result.deltaDistancePct).toBeCloseTo(-100 / 3, 3);
  });
});
