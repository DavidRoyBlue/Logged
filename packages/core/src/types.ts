export type ActivityType = "Run" | "TrailRun" | "Workout" | string;

/** Subset of the Strava activity payload (summary or detail) that Layer 0 reads. */
export interface StravaActivityPayload {
  id: number;
  name?: string;
  distance?: number;            // meters
  moving_time?: number;         // seconds
  elapsed_time?: number;        // seconds
  total_elevation_gain?: number;
  type?: string;
  sport_type?: string;
  workout_type?: number | null;
  start_date?: string;          // ISO 8601 UTC
  timezone?: string;            // e.g. "(GMT-05:00) America/New_York"
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;            // detail only
  [k: string]: unknown;
}

/** From Strava GET /athlete/zones. Last zone max is -1 meaning +infinity. */
export interface AthleteZones {
  heart_rate?: { custom_zones?: boolean; zones?: Array<{ min: number; max: number }> };
  [k: string]: unknown;
}

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
