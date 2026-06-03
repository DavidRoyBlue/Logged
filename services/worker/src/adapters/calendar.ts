import type { NormalizedActivity, MatchResult } from "@logged/core";
import type { OutboundAdapter, PlanInput } from "./types";

// ---------------------------------------------------------------------------
// CalendarClient interface — implemented by the real Google Calendar client
// and by FakeCalendarClient in tests.
// ---------------------------------------------------------------------------
export interface CalendarClient {
  createEvent(input: {
    summary: string;
    description: string;
    start: string;
    colorId?: string;
  }): Promise<{ id: string }>;

  updateEvent(
    id: string,
    patch: { summary?: string; description?: string; colorId?: string }
  ): Promise<void>;

  deleteEvent(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable title from the activity. */
function buildTitle(activity: NormalizedActivity): string {
  if (activity.name) return activity.name;
  const km = (activity.distanceM / 1000).toFixed(1);
  return `${activity.type} ${km}k`;
}

/** Build a short actuals description string. */
function buildActuals(activity: NormalizedActivity): string {
  const km = (activity.distanceM / 1000).toFixed(2);
  const durMin = Math.floor(activity.movingTimeS / 60);
  const durSec = activity.movingTimeS % 60;
  const duration = `${durMin}m ${durSec.toString().padStart(2, "0")}s`;

  let paceStr = "—";
  if (activity.avgPaceSPerKm !== null) {
    const pMin = Math.floor(activity.avgPaceSPerKm / 60);
    const pSec = Math.round(activity.avgPaceSPerKm % 60);
    paceStr = `${pMin}:${pSec.toString().padStart(2, "0")}/km`;
  }

  return `Distance: ${km} km | Duration: ${duration} | Pace: ${paceStr}`;
}

// ---------------------------------------------------------------------------
// CalendarAdapter
// ---------------------------------------------------------------------------
export class CalendarAdapter implements OutboundAdapter {
  constructor(private client: CalendarClient) {}

  async apply(
    activity: NormalizedActivity,
    match: MatchResult,
    existingRef: string | null
  ): Promise<{ externalRef: string }> {
    const title = buildTitle(activity);
    const actuals = buildActuals(activity);

    if (match.action === "completed_plan") {
      if (existingRef !== null) {
        // Update the existing calendar event to reflect completion.
        await this.client.updateEvent(existingRef, {
          summary: `✅ ${title}`,
          description: actuals,
          colorId: "2",
        });
        return { externalRef: existingRef };
      } else {
        // Safety net: no existing ref — create as completed.
        const { id } = await this.client.createEvent({
          summary: `✅ ${title}`,
          description: actuals,
          start: activity.startTime,
          colorId: "2",
        });
        return { externalRef: id };
      }
    }

    // logged_new — create a plain event.
    const { id } = await this.client.createEvent({
      summary: title,
      description: actuals,
      start: activity.startTime,
    });
    return { externalRef: id };
  }

  async revert(record: {
    externalRef: string;
    action: MatchResult["action"];
  }): Promise<void> {
    if (record.action === "completed_plan") {
      // Un-complete: update the event to remove the ✅ marker and green color.
      // The plan still exists — do NOT delete.
      await this.client.updateEvent(record.externalRef, {
        // Restore without the ✅ prefix; we don't have the original title here,
        // so we clear the colorId to signal "no longer completed".
        // Callers that need full title restoration should store it separately.
        colorId: undefined,
      });
    } else {
      // logged_new: the event was created fresh — delete it on revert.
      await this.client.deleteEvent(record.externalRef);
    }
  }

  async createPlanned(plan: PlanInput): Promise<{ externalRef: string }> {
    const { id } = await this.client.createEvent({
      summary: plan.title,
      description: plan.description ?? "",
      start: plan.plannedDate,
    });
    return { externalRef: id };
  }

  async updatePlanned(externalRef: string, plan: PlanInput): Promise<void> {
    await this.client.updateEvent(externalRef, {
      summary: plan.title,
      description: plan.description ?? "",
    });
  }

  async deletePlanned(externalRef: string): Promise<void> {
    await this.client.deleteEvent(externalRef);
  }
}

// ---------------------------------------------------------------------------
// FakeCalendarClient — for tests only
// ---------------------------------------------------------------------------
export class FakeCalendarClient implements CalendarClient {
  created: Array<{ input: Parameters<CalendarClient["createEvent"]>[0] }> = [];
  updated: Array<{ id: string; patch: Parameters<CalendarClient["updateEvent"]>[1] }> = [];
  deleted: string[] = [];

  private counter = 0;

  async createEvent(
    input: Parameters<CalendarClient["createEvent"]>[0]
  ): Promise<{ id: string }> {
    this.created.push({ input });
    return { id: `cal-${this.counter++}` };
  }

  async updateEvent(
    id: string,
    patch: Parameters<CalendarClient["updateEvent"]>[1]
  ): Promise<void> {
    this.updated.push({ id, patch });
  }

  async deleteEvent(id: string): Promise<void> {
    this.deleted.push(id);
  }
}
