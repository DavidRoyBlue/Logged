/** Database row shapes for the Logged app. */

export interface ActivityRow {
  id: string;
  strava_activity_id: number;
  name: string | null;
  type: string;
  start_time: string;
  distance_m: number;
  moving_time_s: number;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  workout_type: number | null;
}

export interface PlanRow {
  id: string;
  type: string;
  planned_date: string;
  title: string;
  target_distance_m: number | null;
  status: "pending" | "completed" | "missed";
  matched_activity_id: string | null;
  calendar_event_id: string | null;
  notion_page_id: string | null;
}

export interface ConnectionRow {
  id: string;
  provider: "strava" | "google_calendar" | "notion";
  status: "pending_config" | "active" | "expired" | "revoked";
  config: Record<string, unknown>;
}

export interface WeekSummary {
  distanceM: number;
  movingTimeS: number;
  count: number;
  /** null when last week has zero distance (avoids division by zero). */
  deltaDistancePct: number | null;
}

export interface PlanWithSync extends PlanRow {
  calendarSynced: boolean;
  notionSynced: boolean;
}
