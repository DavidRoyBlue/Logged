/**
 * Data layer tests — all offline, no real Supabase or network.
 *
 * Strategy: inject a FakeQueryClient whose from(table).select()…chain()
 * resolves to { data: <canned rows>, error: null }.  The fake is a simple
 * chainable builder that ignores filter/order/limit calls and returns the
 * canned data when awaited or when .then() is called.
 */

// ---------------------------------------------------------------------------
// Mock ./supabase so the module-level import in data.ts doesn't blow up.
// ---------------------------------------------------------------------------
jest.mock("./supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  fetchRecentActivities,
  fetchPlans,
  fetchConnections,
  QueryClient,
} from "./data";
import type { ActivityRow, PlanRow, ConnectionRow } from "./types";

// ---------------------------------------------------------------------------
// Fake QueryClient
// ---------------------------------------------------------------------------

/** A chainable fake that ignores all filter calls and resolves to {data, error}. */
class FakeChain {
  constructor(private readonly _data: unknown[] | null) {}

  // Every method except the terminal "then" returns `this` so the chain works.
  select(_cols?: string): this { return this; }
  is(_col: string, _val: unknown): this { return this; }
  order(_col: string, _opts?: unknown): this { return this; }
  limit(_n: number): this { return this; }
  eq(_col: string, _val: unknown): this { return this; }

  // Make the chain a thenable — `await chain` resolves here.
  then<TResult1 = { data: unknown[]; error: null }>(
    onfulfilled?: ((value: { data: unknown[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null | undefined
  ): Promise<TResult1> {
    return Promise.resolve({ data: this._data, error: null }).then(onfulfilled);
  }
}

function makeFakeClient(tableData: Record<string, unknown[]>): QueryClient {
  return {
    from(table: string) {
      return new FakeChain(tableData[table] ?? []);
    },
  };
}

// ---------------------------------------------------------------------------
// Canned data
// ---------------------------------------------------------------------------

const ACTIVITY_ROWS: ActivityRow[] = [
  {
    id: "a1",
    strava_activity_id: 1001,
    name: "Morning Run",
    type: "Run",
    start_time: "2024-06-05T08:00:00.000Z",
    distance_m: 5000,
    moving_time_s: 1500,
    avg_pace_s_per_km: 300,
    avg_hr: 145,
    elevation_gain_m: 50,
    workout_type: 0,
  },
  {
    id: "a2",
    strava_activity_id: 1002,
    name: null,
    type: "Ride",
    start_time: "2024-06-04T07:00:00.000Z",
    distance_m: 20000,
    moving_time_s: 3600,
    avg_pace_s_per_km: null,
    avg_hr: null,
    elevation_gain_m: null,
    workout_type: null,
  },
];

const PLAN_ROWS: (PlanRow & Record<string, unknown>)[] = [
  {
    id: "p1",
    type: "easy",
    planned_date: "2024-06-10",
    title: "Easy 5k",
    target_distance_m: 5000,
    status: "pending",
    matched_activity_id: null,
    calendar_event_id: "gcal-event-xyz",
    notion_page_id: null,
  },
  {
    id: "p2",
    type: "long",
    planned_date: "2024-06-15",
    title: "Long Run",
    target_distance_m: 15000,
    status: "completed",
    matched_activity_id: "a1",
    calendar_event_id: null,
    notion_page_id: "notion-page-abc",
  },
  {
    id: "p3",
    type: "rest",
    planned_date: "2024-06-16",
    title: "Rest",
    target_distance_m: null,
    status: "missed",
    matched_activity_id: null,
    calendar_event_id: null,
    notion_page_id: null,
  },
];

const CONNECTION_ROWS: ConnectionRow[] = [
  {
    id: "c1",
    provider: "strava",
    status: "active",
    config: { athlete_id: 42 },
  },
  {
    id: "c2",
    provider: "google_calendar",
    status: "pending_config",
    config: {},
  },
];

// ---------------------------------------------------------------------------
// fetchRecentActivities
// ---------------------------------------------------------------------------

describe("fetchRecentActivities", () => {
  it("returns the rows from the activities table", async () => {
    const client = makeFakeClient({ activities: ACTIVITY_ROWS });
    const result = await fetchRecentActivities(client);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a1");
    expect(result[1].type).toBe("Ride");
  });

  it("returns an empty array when there are no activities", async () => {
    const client = makeFakeClient({ activities: [] });
    const result = await fetchRecentActivities(client);
    expect(result).toEqual([]);
  });

  it("passes through all ActivityRow fields", async () => {
    const client = makeFakeClient({ activities: ACTIVITY_ROWS });
    const [first] = await fetchRecentActivities(client);
    expect(first.strava_activity_id).toBe(1001);
    expect(first.avg_pace_s_per_km).toBe(300);
    expect(first.workout_type).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchPlans — calendarSynced / notionSynced mapping
// ---------------------------------------------------------------------------

describe("fetchPlans", () => {
  it("maps calendarSynced=true when calendar_event_id is present", async () => {
    const client = makeFakeClient({ plans: PLAN_ROWS });
    const result = await fetchPlans(client);
    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.calendarSynced).toBe(true);
    expect(p1.notionSynced).toBe(false);
  });

  it("maps notionSynced=true when notion_page_id is present", async () => {
    const client = makeFakeClient({ plans: PLAN_ROWS });
    const result = await fetchPlans(client);
    const p2 = result.find((p) => p.id === "p2")!;
    expect(p2.calendarSynced).toBe(false);
    expect(p2.notionSynced).toBe(true);
  });

  it("maps calendarSynced=false and notionSynced=false when both refs are null", async () => {
    const client = makeFakeClient({ plans: PLAN_ROWS });
    const result = await fetchPlans(client);
    const p3 = result.find((p) => p.id === "p3")!;
    expect(p3.calendarSynced).toBe(false);
    expect(p3.notionSynced).toBe(false);
  });

  it("preserves all base PlanRow fields", async () => {
    const client = makeFakeClient({ plans: PLAN_ROWS });
    const [first] = await fetchPlans(client);
    expect(first.id).toBe("p1");
    expect(first.status).toBe("pending");
    expect(first.target_distance_m).toBe(5000);
  });

  it("returns empty array when there are no plans", async () => {
    const client = makeFakeClient({ plans: [] });
    const result = await fetchPlans(client);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchConnections
// ---------------------------------------------------------------------------

describe("fetchConnections", () => {
  it("returns all connection rows", async () => {
    const client = makeFakeClient({ connections: CONNECTION_ROWS });
    const result = await fetchConnections(client);
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe("strava");
    expect(result[1].status).toBe("pending_config");
  });

  it("returns an empty array when there are no connections", async () => {
    const client = makeFakeClient({ connections: [] });
    const result = await fetchConnections(client);
    expect(result).toEqual([]);
  });

  it("preserves config as a record", async () => {
    const client = makeFakeClient({ connections: CONNECTION_ROWS });
    const [first] = await fetchConnections(client);
    expect(first.config).toEqual({ athlete_id: 42 });
  });
});
