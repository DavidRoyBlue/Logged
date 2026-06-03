import { describe, it, expect } from "vitest";
import { withinWindow, matcher } from "./matcher";
import type { NormalizedActivity, PlannedSession } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaActivityId: 1,
    type: "Run",
    startTime: "2026-05-02T07:00:00Z",
    timezone: "UTC",
    distanceM: 10000,
    movingTimeS: 3600,
    elapsedTimeS: 3600,
    avgPaceSPerKm: null,
    avgHr: null,
    maxHr: null,
    elevationGainM: null,
    calories: null,
    name: null,
    workoutType: null,
    zoneDistribution: null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: "plan-1",
    type: "Run",
    plannedDate: "2026-05-02",
    targetDistanceM: null,
    status: "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// withinWindow (existing)
// ---------------------------------------------------------------------------

describe("withinWindow", () => {
  it("true when plan date is within ±36h of the activity start", () => {
    expect(withinWindow("2026-05-02", "2026-05-02T07:00:00Z", 36)).toBe(true);
  });
  it("false when outside the window", () => {
    expect(withinWindow("2026-05-10", "2026-05-02T07:00:00Z", 36)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matcher()
// ---------------------------------------------------------------------------

describe("matcher", () => {
  // --- Basic match ---

  it("returns completed_plan for a single in-window same-type pending plan with no target", () => {
    const activity = makeActivity({ startTime: "2026-05-02T07:00:00Z", type: "Run" });
    const plan = makePlan({ plannedDate: "2026-05-02", type: "Run", targetDistanceM: null, status: "pending" });

    const result = matcher(activity, [plan]);

    expect(result).toMatchObject({ action: "completed_plan", planId: plan.id });
    if (result.action === "completed_plan") {
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  // --- Window boundary ---

  it("returns logged_new when plan is outside ±36h window", () => {
    const activity = makeActivity({ startTime: "2026-05-02T07:00:00Z" });
    // planDate noon UTC = 2026-05-05T12:00:00Z → 77h away — outside window
    const plan = makePlan({ plannedDate: "2026-05-05", status: "pending" });

    expect(matcher(activity, [plan])).toEqual({ action: "logged_new" });
  });

  // --- Type mismatch ---

  it("returns logged_new when activity type does not match plan type (Run vs Swim)", () => {
    const activity = makeActivity({ type: "Run" });
    const plan = makePlan({ type: "Swim", status: "pending" });

    expect(matcher(activity, [plan])).toEqual({ action: "logged_new" });
  });

  // --- Run-family compatibility ---

  it("matches when activity is TrailRun and plan is Run (both in run-family)", () => {
    const activity = makeActivity({ type: "TrailRun" });
    const plan = makePlan({ type: "Run", status: "pending" });

    const result = matcher(activity, [plan]);
    expect(result).toMatchObject({ action: "completed_plan", planId: plan.id });
  });

  // --- Non-pending candidate ---

  it("ignores completed plans and returns logged_new when that is the only candidate", () => {
    const activity = makeActivity();
    const plan = makePlan({ status: "completed" });

    expect(matcher(activity, [plan])).toEqual({ action: "logged_new" });
  });

  // --- Distance scoring selects best plan ---

  it("picks plan A (target 10000) over plan B (target 5000) when activity distance is 10000", () => {
    const activity = makeActivity({ distanceM: 10000, startTime: "2026-05-02T12:00:00Z" });
    const planA = makePlan({ id: "plan-a", plannedDate: "2026-05-02", targetDistanceM: 10000 });
    const planB = makePlan({ id: "plan-b", plannedDate: "2026-05-02", targetDistanceM: 5000 });

    const result = matcher(activity, [planA, planB]);
    expect(result).toMatchObject({ action: "completed_plan", planId: "plan-a" });
  });

  // --- Distance disqualification (>50% off target) ---

  it("disqualifies plan when activity distance is >50% from target (20000 vs target 10000)", () => {
    const activity = makeActivity({ distanceM: 20000 });
    const plan = makePlan({ targetDistanceM: 10000, status: "pending" });

    expect(matcher(activity, [plan])).toEqual({ action: "logged_new" });
  });

  // --- Tie-break: earliest plannedDate ---

  it("tie-break: picks plan with earliest plannedDate when scores are equal (same score, different dates)", () => {
    // Both no-target plans but different dates — the earlier date has a slightly higher dateScore.
    // To guarantee an actual tie we use identical dates and only differ id.
    // Let's test the same-date → lowest-id tie-break first (see next test).
    // Here: same activity start 2026-05-03T12:00:00Z, planEarly=2026-05-03 (0h off), planLate=2026-05-04 (24h off).
    // planEarly has higher dateScore → should win even without same-score assertion.
    const activity = makeActivity({ startTime: "2026-05-03T12:00:00Z", distanceM: 10000 });
    const planEarly = makePlan({ id: "plan-early", plannedDate: "2026-05-03", targetDistanceM: null });
    const planLate = makePlan({ id: "plan-late", plannedDate: "2026-05-04", targetDistanceM: null });

    const result = matcher(activity, [planLate, planEarly]); // intentionally reversed input order
    expect(result).toMatchObject({ action: "completed_plan", planId: "plan-early" });
  });

  it("tie-break: when scores are truly equal (same date, no target), picks lowest id lexicographically", () => {
    const activity = makeActivity({ startTime: "2026-05-03T12:00:00Z" });
    const planA = makePlan({ id: "plan-a", plannedDate: "2026-05-03", targetDistanceM: null });
    const planB = makePlan({ id: "plan-z", plannedDate: "2026-05-03", targetDistanceM: null });

    const result = matcher(activity, [planB, planA]); // intentionally reversed
    expect(result).toMatchObject({ action: "completed_plan", planId: "plan-a" });
  });

  // --- Confidence bounds ---

  it("confidence is within (0, 1]", () => {
    const activity = makeActivity({ startTime: "2026-05-02T12:00:00Z", distanceM: 10000 });
    // Exact match: plan noon UTC same day, same distance → max possible scores
    const plan = makePlan({ plannedDate: "2026-05-02", targetDistanceM: 10000 });

    const result = matcher(activity, [plan]);
    if (result.action === "completed_plan") {
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    } else {
      throw new Error("Expected completed_plan");
    }
  });
});
