export type ActivityType = "Run" | "TrailRun" | "Workout" | string;

/** Normalized activity — the shape `normalize()` emits and the matcher consumes. */
export interface NormalizedActivity {
  stravaActivityId: number;
  type: ActivityType;
  startTime: string;          // ISO 8601
  timezone: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  calories: number | null;
  name: string | null;
  workoutType: number | null; // 1 = race
  zoneDistribution: ZoneDistribution | null;
}

export interface ZoneDistribution { z1_seconds: number; z2_seconds: number; z3_seconds: number; z4_seconds: number; z5_seconds: number; }

export interface PlannedSession {
  id: string;
  type: ActivityType;
  plannedDate: string;        // YYYY-MM-DD
  targetDistanceM: number | null;
  status: "pending" | "completed" | "missed";
}

export type MatchResult =
  | { action: "completed_plan"; planId: string; confidence: number }
  | { action: "logged_new" };

/** Outbound destination contract — implemented by Calendar/Notion adapters in Plan 4. */
export interface OutboundDestination {
  apply(activity: NormalizedActivity, match: MatchResult): Promise<{ externalRef: string }>;
  revert(record: { externalRef: string; action: MatchResult["action"] }): Promise<void>;
}
