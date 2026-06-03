/**
 * Plan-push worker: pushes planned session changes to external outbound adapters.
 * Supports create / edit / delete / revert operations.
 */
import type { Db } from "./db";
import type { OutboundAdapter, PlanInput } from "./adapters/types";

// ---------------------------------------------------------------------------
// processPlanPush
// ---------------------------------------------------------------------------
export async function processPlanPush(
  job: {
    user_id: string;
    plan_id: string;
    op: "create" | "edit" | "delete" | "revert";
  },
  deps: { db: Db; adapters: Record<string, OutboundAdapter> }
): Promise<{ op: string; touched: number }> {
  const { user_id, plan_id, op } = job;
  const { db, adapters } = deps;

  // Load the plan row
  const plan = await db.getPlan(plan_id);

  // If plan is missing and op is not delete, nothing to do
  if (plan === null) {
    return { op, touched: 0 };
  }

  // Get active outbound connections for this user
  const conns = await db.getActiveOutboundConnections(user_id);

  // Build PlanInput from the plan row
  const input: PlanInput = {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    type: plan.type,
    plannedDate: plan.plannedDate,
    targetDistanceM: plan.targetDistanceM,
  };

  let touched = 0;

  for (const conn of conns) {
    const provider = conn.provider;
    const adapter = adapters[provider];

    // Skip if no adapter registered for this provider
    if (!adapter) continue;

    const existingRef =
      provider === "google_calendar" ? plan.calendarEventId : plan.notionPageId;

    if (op === "create") {
      if (existingRef) {
        // Already pushed — idempotent skip
        continue;
      }
      const { externalRef } = await adapter.createPlanned(input);
      await db.setPlanRef(plan_id, provider, externalRef);
      touched++;
    } else if (op === "edit") {
      if (existingRef) {
        await adapter.updatePlanned(existingRef, input);
        touched++;
      } else {
        // No existing ref — treat like create
        const { externalRef } = await adapter.createPlanned(input);
        await db.setPlanRef(plan_id, provider, externalRef);
        touched++;
      }
    } else if (op === "delete") {
      if (existingRef) {
        await adapter.deletePlanned(existingRef);
        touched++;
      }
    } else if (op === "revert") {
      if (existingRef) {
        await adapter.revert({ externalRef: existingRef, action: "completed_plan" });
        touched++;
      }
    }
  }

  // After fan-out, for delete: remove the plan row
  if (op === "delete") {
    await db.deletePlan(plan_id);
  }

  return { op, touched };
}
