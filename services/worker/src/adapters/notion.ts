import type { NormalizedActivity, MatchResult } from "@logged/core";
import type { OutboundAdapter, PlanInput } from "./types";

// ---------------------------------------------------------------------------
// NotionClient interface — implemented by the real Notion API client
// and by FakeNotionClient in tests.
// ---------------------------------------------------------------------------
export interface NotionClient {
  createPage(props: Record<string, unknown>): Promise<{ id: string }>;
  updatePage(id: string, props: Record<string, unknown>): Promise<void>;
  archivePage(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable name from the activity. */
function buildName(activity: NormalizedActivity): string {
  if (activity.name) return activity.name;
  const km = (activity.distanceM / 1000).toFixed(1);
  return `${activity.type} ${km}k`;
}

/** Kilometers rounded to 2 decimal places. */
function toKm(distanceM: number): number {
  return Math.round((distanceM / 1000) * 100) / 100;
}

/** Pace formatted as "M:SS/km" string. */
function formatPace(avgPaceSPerKm: number | null): string {
  if (avgPaceSPerKm === null) return "—";
  const pMin = Math.floor(avgPaceSPerKm / 60);
  const pSec = Math.round(avgPaceSPerKm % 60);
  return `${pMin}:${pSec.toString().padStart(2, "0")}/km`;
}

/** Build the actuals properties for a Notion page. */
function buildActualsProps(activity: NormalizedActivity): Record<string, unknown> {
  return {
    "Actual Distance": toKm(activity.distanceM),
    "Actual Duration": activity.movingTimeS,
    "Actual Pace": formatPace(activity.avgPaceSPerKm),
  };
}

// ---------------------------------------------------------------------------
// NotionAdapter
// ---------------------------------------------------------------------------
export class NotionAdapter implements OutboundAdapter {
  constructor(private client: NotionClient) {}

  async apply(
    activity: NormalizedActivity,
    match: MatchResult,
    existingRef: string | null
  ): Promise<{ externalRef: string }> {
    const name = buildName(activity);
    const actuals = buildActualsProps(activity);

    if (match.action === "completed_plan") {
      if (existingRef !== null) {
        // Update the existing Notion page to reflect completion.
        await this.client.updatePage(existingRef, {
          Status: "Done",
          ...actuals,
        });
        return { externalRef: existingRef };
      } else {
        // Safety net: no existing ref — create as completed.
        const { id } = await this.client.createPage({
          Name: name,
          Status: "Done",
          ...actuals,
        });
        return { externalRef: id };
      }
    }

    // logged_new — create a page for the new activity (not a planned session).
    const { id } = await this.client.createPage({
      Name: name,
      Status: "logged",
      ...actuals,
    });
    return { externalRef: id };
  }

  async revert(record: {
    externalRef: string;
    action: MatchResult["action"];
  }): Promise<void> {
    if (record.action === "completed_plan") {
      // Un-complete: restore the page status to pending and clear actuals.
      // The plan still exists — do NOT archive.
      await this.client.updatePage(record.externalRef, {
        Status: "pending",
        "Actual Distance": null,
        "Actual Duration": null,
        "Actual Pace": null,
      });
    } else {
      // logged_new: the page was created fresh — archive it on revert.
      await this.client.archivePage(record.externalRef);
    }
  }

  async createPlanned(plan: PlanInput): Promise<{ externalRef: string }> {
    const { id } = await this.client.createPage({
      Name: plan.title,
      Date: plan.plannedDate,
      Type: plan.type,
      Status: "pending",
      "Target Distance": plan.targetDistanceM,
    });
    return { externalRef: id };
  }

  async updatePlanned(externalRef: string, plan: PlanInput): Promise<void> {
    await this.client.updatePage(externalRef, {
      Name: plan.title,
      Date: plan.plannedDate,
      Type: plan.type,
      "Target Distance": plan.targetDistanceM,
    });
  }

  async deletePlanned(externalRef: string): Promise<void> {
    await this.client.archivePage(externalRef);
  }
}

// ---------------------------------------------------------------------------
// FakeNotionClient — for tests only
// ---------------------------------------------------------------------------
export class FakeNotionClient implements NotionClient {
  created: Array<{ props: Record<string, unknown> }> = [];
  updated: Array<{ id: string; props: Record<string, unknown> }> = [];
  archived: string[] = [];

  private counter = 0;

  async createPage(props: Record<string, unknown>): Promise<{ id: string }> {
    this.created.push({ props });
    return { id: `notion-${this.counter++}` };
  }

  async updatePage(id: string, props: Record<string, unknown>): Promise<void> {
    this.updated.push({ id, props });
  }

  async archivePage(id: string): Promise<void> {
    this.archived.push(id);
  }
}
