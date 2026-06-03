import { matcher } from "@logged/core";
import type { Db } from "./db";
import type { OutboundAdapter } from "./adapters/types";

/**
 * processSyncJob — core sync worker logic.
 *
 * 1. Load the activity from DB; if not found, return {action: "skipped"}.
 * 2. Find pending plans within ±2 days and run matcher.
 * 3. If match → completed_plan, mark the plan completed.
 * 4. Fan-out to all active outbound connections (idempotent via hasOkOutbound).
 * 5. Return action and outbound count.
 */
export async function processSyncJob(
  job: { user_id: string; strava_activity_id: number },
  deps: { db: Db; adapters: Record<string, OutboundAdapter> }
): Promise<{ action: "completed_plan" | "logged_new" | "skipped"; outbound: number }> {
  const { user_id, strava_activity_id } = job;
  const { db, adapters } = deps;

  // 1. Load activity
  const activity = await db.getActivityForSync(user_id, strava_activity_id);
  if (!activity) {
    return { action: "skipped", outbound: 0 };
  }
  const { activityId, normalized } = activity;

  // 2. Find pending plans in ±2 day window and run matcher
  const plans = await db.getPendingPlansInWindow(user_id, normalized.startTime);
  const match = matcher(normalized, plans);

  // 3. If match → completed_plan, mark the plan completed
  if (match.action === "completed_plan") {
    await db.completePlan(match.planId, activityId);
  }

  // 4. Fan-out to active outbound connections
  const conns = await db.getActiveOutboundConnections(user_id);
  let outbound = 0;

  for (const conn of conns) {
    // Idempotency: skip if already successfully synced
    if (await db.hasOkOutbound(activityId, conn.id)) {
      continue;
    }

    const adapter = adapters[conn.provider];
    if (!adapter) {
      continue;
    }

    // For completed_plan, retrieve any existing external ref from the plan
    const existingRef =
      match.action === "completed_plan"
        ? await db.getPlanRef(match.planId, conn.provider)
        : null;

    try {
      const { externalRef } = await adapter.apply(normalized, match, existingRef);
      await db.recordOutbound(user_id, activityId, conn.id, externalRef, match.action, "ok");
      outbound++;
    } catch (e) {
      await db.recordOutbound(
        user_id,
        activityId,
        conn.id,
        null,
        match.action,
        "failed",
        String(e)
      );
    }
  }

  return { action: match.action, outbound };
}
