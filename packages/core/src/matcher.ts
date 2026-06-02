import type { NormalizedActivity, PlannedSession, MatchResult } from "./types";

/** True when a plan's date falls within ±hours of the activity start time. */
export function withinWindow(plannedDate: string, activityStartIso: string, hours: number): boolean {
  const planMs = new Date(`${plannedDate}T12:00:00Z`).getTime();
  const actMs = new Date(activityStartIso).getTime();
  return Math.abs(planMs - actMs) <= hours * 3600 * 1000;
}

/** Full scored matcher is implemented in Plan 4 (Sync loop). */
export function matcher(_activity: NormalizedActivity, _candidates: PlannedSession[]): MatchResult {
  throw new Error("matcher() is implemented in Plan 4 (Sync loop)");
}
