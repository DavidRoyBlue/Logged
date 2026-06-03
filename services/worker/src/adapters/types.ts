import type { NormalizedActivity, MatchResult } from "@logged/core";

/**
 * Represents a planned session for push to external adapters.
 */
export interface PlanInput {
  id: string;
  title: string;
  description: string | null;
  type: string;
  plannedDate: string;
  targetDistanceM: number | null;
}

/**
 * Worker-local outbound adapter interface.
 * Richer than the core sketch: apply receives the existingRef already stored
 * on the matched plan (null if none yet), enabling update-vs-create decisions.
 */
export interface OutboundAdapter {
  /**
   * Apply an activity result to the external destination.
   * @param activity   The normalized activity from Strava.
   * @param match      The match result (completed_plan or logged_new).
   * @param existingRef The calendar_event_id / notion_page_id already on the plan
   *                    (null if the plan has no external ref yet, or action is logged_new).
   * @returns The external reference ID to store in outbound_records.
   */
  apply(
    activity: NormalizedActivity,
    match: MatchResult,
    existingRef: string | null
  ): Promise<{ externalRef: string }>;

  /**
   * Revert a previously applied write (e.g., on job failure or duplicate).
   * - revert completed_plan → un-complete (update), NOT delete — the plan still exists.
   * - revert logged_new → delete / archive the created record.
   */
  revert(record: {
    externalRef: string;
    action: MatchResult["action"];
  }): Promise<void>;

  /**
   * Create an external planned event from a PlanInput.
   * @returns The external reference ID to store on the plan row.
   */
  createPlanned(plan: PlanInput): Promise<{ externalRef: string }>;

  /**
   * Update an existing external planned event.
   */
  updatePlanned(externalRef: string, plan: PlanInput): Promise<void>;

  /**
   * Delete (archive) an existing external planned event.
   */
  deletePlanned(externalRef: string): Promise<void>;
}
