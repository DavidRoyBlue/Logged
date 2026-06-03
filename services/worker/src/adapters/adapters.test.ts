/**
 * Unit tests for Calendar + Notion outbound adapters.
 * Pure logic over injected fake clients — NO real network.
 * Written FIRST (TDD). Run with: pnpm --filter @logged/worker test
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedActivity, MatchResult } from "@logged/core";
import { CalendarAdapter, FakeCalendarClient } from "./calendar";
import { NotionAdapter, FakeNotionClient } from "./notion";
import type { PlanInput } from "./types";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------
function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaActivityId: 1001,
    type: "Run",
    startTime: "2026-06-01T07:00:00Z",
    timezone: "(GMT-05:00) America/New_York",
    distanceM: 10000,
    movingTimeS: 3000,
    elapsedTimeS: 3100,
    avgPaceSPerKm: 300,
    avgHr: 150,
    maxHr: 170,
    elevationGainM: 50,
    calories: 600,
    name: "Morning Run",
    workoutType: null,
    zoneDistribution: null,
    ...overrides,
  };
}

const completedMatch: MatchResult = {
  action: "completed_plan",
  planId: "plan-abc",
  confidence: 0.9,
};

const loggedNewMatch: MatchResult = { action: "logged_new" };

// ===========================================================================
// CalendarAdapter
// ===========================================================================
describe("CalendarAdapter", () => {
  let client: FakeCalendarClient;
  let adapter: CalendarAdapter;

  beforeEach(() => {
    client = new FakeCalendarClient();
    adapter = new CalendarAdapter(client);
  });

  // -------------------------------------------------------------------------
  // apply — completed_plan with existingRef → UPDATE (not create), returns existingRef
  // -------------------------------------------------------------------------
  it("completed_plan + existingRef: calls updateEvent on that ref, NOT createEvent; returns existingRef", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, completedMatch, "cal-existing-99");

    expect(client.created).toHaveLength(0);
    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("cal-existing-99");
    expect(client.updated[0]!.patch.summary).toContain("✅");
    expect(client.updated[0]!.patch.colorId).toBe("2");
    expect(externalRef).toBe("cal-existing-99");
  });

  // -------------------------------------------------------------------------
  // apply — completed_plan with null ref → CREATE as completed; returns new id
  // -------------------------------------------------------------------------
  it("completed_plan + null ref: calls createEvent (create-as-completed); returns new id", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, completedMatch, null);

    expect(client.created).toHaveLength(1);
    expect(client.updated).toHaveLength(0);
    expect(client.created[0]!.input.summary).toContain("✅");
    expect(client.created[0]!.input.colorId).toBe("2");
    expect(externalRef).toBe("cal-0"); // FakeCalendarClient returns cal-{n}
  });

  // -------------------------------------------------------------------------
  // apply — logged_new → CREATE (no ✅); returns new id
  // -------------------------------------------------------------------------
  it("logged_new: calls createEvent without ✅; returns new id", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, loggedNewMatch, null);

    expect(client.created).toHaveLength(1);
    expect(client.updated).toHaveLength(0);
    expect(client.created[0]!.input.summary).not.toContain("✅");
    expect(client.created[0]!.input.start).toBe(activity.startTime);
    expect(externalRef).toBe("cal-0");
  });

  // -------------------------------------------------------------------------
  // revert — completed_plan → UPDATE (un-complete), NOT delete
  // -------------------------------------------------------------------------
  it("revert completed_plan: calls updateEvent (removes ✅), does NOT deleteEvent", async () => {
    await adapter.revert({ externalRef: "cal-existing-99", action: "completed_plan" });

    expect(client.deleted).toHaveLength(0);
    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("cal-existing-99");
    // colorId should be cleared (not "2")
    expect(client.updated[0]!.patch.colorId).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // revert — logged_new → DELETE
  // -------------------------------------------------------------------------
  it("revert logged_new: calls deleteEvent", async () => {
    await adapter.revert({ externalRef: "cal-new-55", action: "logged_new" });

    expect(client.deleted).toHaveLength(1);
    expect(client.deleted[0]).toBe("cal-new-55");
    expect(client.updated).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Title fallback when activity.name is null
  // -------------------------------------------------------------------------
  it("uses type+km title when activity.name is null", async () => {
    const activity = makeActivity({ name: null, distanceM: 5000, type: "Run" });
    await adapter.apply(activity, loggedNewMatch, null);

    expect(client.created[0]!.input.summary).toContain("Run");
    expect(client.created[0]!.input.summary).toContain("5");
  });
});

// ===========================================================================
// NotionAdapter
// ===========================================================================
describe("NotionAdapter", () => {
  let client: FakeNotionClient;
  let adapter: NotionAdapter;

  beforeEach(() => {
    client = new FakeNotionClient();
    adapter = new NotionAdapter(client);
  });

  // -------------------------------------------------------------------------
  // apply — completed_plan with existingRef → UPDATE, returns existingRef
  // -------------------------------------------------------------------------
  it("completed_plan + existingRef: calls updatePage on that ref, NOT createPage; returns existingRef", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, completedMatch, "notion-existing-77");

    expect(client.created).toHaveLength(0);
    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("notion-existing-77");
    expect(client.updated[0]!.props["Status"]).toBe("Done");
    expect(externalRef).toBe("notion-existing-77");
  });

  // -------------------------------------------------------------------------
  // apply — completed_plan with null ref → CREATE as completed; returns new id
  // -------------------------------------------------------------------------
  it("completed_plan + null ref: calls createPage with Done status; returns new id", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, completedMatch, null);

    expect(client.created).toHaveLength(1);
    expect(client.updated).toHaveLength(0);
    expect(client.created[0]!.props["Status"]).toBe("Done");
    expect(externalRef).toBe("notion-0"); // FakeNotionClient returns notion-{n}
  });

  // -------------------------------------------------------------------------
  // apply — logged_new → CREATE; returns new id
  // -------------------------------------------------------------------------
  it("logged_new: calls createPage; returns new id", async () => {
    const activity = makeActivity();
    const { externalRef } = await adapter.apply(activity, loggedNewMatch, null);

    expect(client.created).toHaveLength(1);
    expect(client.updated).toHaveLength(0);
    // logged_new should NOT set Status Done
    expect(client.created[0]!.props["Status"]).not.toBe("Done");
    expect(externalRef).toBe("notion-0");
  });

  // -------------------------------------------------------------------------
  // revert — completed_plan → UPDATE to pending, NOT archive
  // -------------------------------------------------------------------------
  it("revert completed_plan: calls updatePage (Status=pending), does NOT archivePage", async () => {
    await adapter.revert({ externalRef: "notion-existing-77", action: "completed_plan" });

    expect(client.archived).toHaveLength(0);
    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("notion-existing-77");
    expect(client.updated[0]!.props["Status"]).toBe("pending");
  });

  // -------------------------------------------------------------------------
  // revert — logged_new → ARCHIVE
  // -------------------------------------------------------------------------
  it("revert logged_new: calls archivePage", async () => {
    await adapter.revert({ externalRef: "notion-new-33", action: "logged_new" });

    expect(client.archived).toHaveLength(1);
    expect(client.archived[0]).toBe("notion-new-33");
    expect(client.updated).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Actuals are included in updated props
  // -------------------------------------------------------------------------
  it("completed_plan update includes Actual Distance, Actual Duration, Actual Pace", async () => {
    const activity = makeActivity({ distanceM: 10000, movingTimeS: 3000, avgPaceSPerKm: 300 });
    await adapter.apply(activity, completedMatch, "notion-xyz");

    const props = client.updated[0]!.props;
    expect(props["Actual Distance"]).toBeDefined();
    expect(props["Actual Duration"]).toBeDefined();
    expect(props["Actual Pace"]).toBeDefined();
  });
});

// ===========================================================================
// Shared plan fixture
// ===========================================================================
function makePlan(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    id: "plan-test-001",
    title: "Morning 10k",
    description: "Easy run",
    type: "Run",
    plannedDate: "2026-06-10",
    targetDistanceM: 10000,
    ...overrides,
  };
}

// ===========================================================================
// CalendarAdapter — plan methods
// ===========================================================================
describe("CalendarAdapter plan methods", () => {
  let client: FakeCalendarClient;
  let adapter: CalendarAdapter;

  beforeEach(() => {
    client = new FakeCalendarClient();
    adapter = new CalendarAdapter(client);
  });

  it("createPlanned: calls createEvent with title, description, date; returns new id", async () => {
    const plan = makePlan();
    const { externalRef } = await adapter.createPlanned(plan);

    expect(client.created).toHaveLength(1);
    expect(client.created[0]!.input.summary).toBe(plan.title);
    expect(client.created[0]!.input.description).toBe(plan.description);
    expect(client.created[0]!.input.start).toBe(plan.plannedDate);
    expect(externalRef).toBe("cal-0");
  });

  it("createPlanned: null description passed as empty string", async () => {
    const plan = makePlan({ description: null });
    await adapter.createPlanned(plan);

    expect(client.created[0]!.input.description).toBe("");
  });

  it("updatePlanned: calls updateEvent with summary and description on given ref", async () => {
    const plan = makePlan({ title: "Updated Run", description: "Revised" });
    await adapter.updatePlanned("cal-existing-42", plan);

    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("cal-existing-42");
    expect(client.updated[0]!.patch.summary).toBe("Updated Run");
    expect(client.updated[0]!.patch.description).toBe("Revised");
  });

  it("deletePlanned: calls deleteEvent on given ref", async () => {
    await adapter.deletePlanned("cal-to-delete");

    expect(client.deleted).toHaveLength(1);
    expect(client.deleted[0]).toBe("cal-to-delete");
  });
});

// ===========================================================================
// NotionAdapter — plan methods
// ===========================================================================
describe("NotionAdapter plan methods", () => {
  let client: FakeNotionClient;
  let adapter: NotionAdapter;

  beforeEach(() => {
    client = new FakeNotionClient();
    adapter = new NotionAdapter(client);
  });

  it("createPlanned: calls createPage with Name, Date, Type, Status=pending, Target Distance; returns new id", async () => {
    const plan = makePlan();
    const { externalRef } = await adapter.createPlanned(plan);

    expect(client.created).toHaveLength(1);
    const props = client.created[0]!.props;
    expect(props["Name"]).toBe(plan.title);
    expect(props["Date"]).toBe(plan.plannedDate);
    expect(props["Type"]).toBe(plan.type);
    expect(props["Status"]).toBe("pending");
    expect(props["Target Distance"]).toBe(plan.targetDistanceM);
    expect(externalRef).toBe("notion-0");
  });

  it("createPlanned: null targetDistanceM is passed as null", async () => {
    const plan = makePlan({ targetDistanceM: null });
    await adapter.createPlanned(plan);

    expect(client.created[0]!.props["Target Distance"]).toBeNull();
  });

  it("updatePlanned: calls updatePage with updated fields on given ref", async () => {
    const plan = makePlan({ title: "Long Run", description: "Easy effort" });
    await adapter.updatePlanned("notion-existing-77", plan);

    expect(client.updated).toHaveLength(1);
    expect(client.updated[0]!.id).toBe("notion-existing-77");
    const props = client.updated[0]!.props;
    expect(props["Name"]).toBe("Long Run");
    expect(props["Date"]).toBe(plan.plannedDate);
    expect(props["Type"]).toBe(plan.type);
    expect(props["Target Distance"]).toBe(plan.targetDistanceM);
  });

  it("deletePlanned: calls archivePage on given ref", async () => {
    await adapter.deletePlanned("notion-to-delete");

    expect(client.archived).toHaveLength(1);
    expect(client.archived[0]).toBe("notion-to-delete");
  });
});
