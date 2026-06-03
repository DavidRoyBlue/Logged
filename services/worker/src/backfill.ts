import { normalize } from "@logged/core";
import type { StravaClient } from "./strava";
import type { Db } from "./db";

// ---------------------------------------------------------------------------
// Job shape
// ---------------------------------------------------------------------------
export interface BackfillJob {
  user_id: string;
  window: "90d" | "full";
  accessToken: string;
}

// ---------------------------------------------------------------------------
// processBackfill
// ---------------------------------------------------------------------------
export async function processBackfill(
  job: BackfillJob,
  deps: { strava: StravaClient; db: Db }
): Promise<{ imported: number; window: "90d" | "full" }> {
  const { strava, db } = deps;

  // -----------------------------------------------------------------------
  // 1. Load profile and apply tier-gate
  // -----------------------------------------------------------------------
  const profile = await db.getProfile(job.user_id);
  let effectiveWindow: "90d" | "full" = job.window;
  if (job.window === "full" && profile?.tier !== "pro") {
    effectiveWindow = "90d";
  }

  // -----------------------------------------------------------------------
  // 2. Compute afterEpoch
  // -----------------------------------------------------------------------
  const afterEpoch: number | undefined =
    effectiveWindow === "90d"
      ? Math.floor((Date.now() - 90 * 86400 * 1000) / 1000)
      : undefined;

  // -----------------------------------------------------------------------
  // 3. Mark running
  // -----------------------------------------------------------------------
  await db.setBackfillRunning(job.user_id, effectiveWindow);

  // -----------------------------------------------------------------------
  // 4. Load athlete zones once
  // -----------------------------------------------------------------------
  const zones = await db.getAthleteZones(job.user_id);

  // -----------------------------------------------------------------------
  // 5. Paginate through listActivities
  // -----------------------------------------------------------------------
  const perPage = 100;
  let page = 1;
  let imported = 0;

  while (true) {
    const summaries = await strava.listActivities(
      { afterEpoch, page, perPage },
      job.accessToken
    );

    if (summaries.length === 0) {
      break;
    }

    // Upsert each activity in this page
    for (const summary of summaries) {
      const normalized = normalize(
        summary as Parameters<typeof normalize>[0],
        zones
      );
      await db.upsertActivity(job.user_id, normalized, summary);
      imported++;
    }

    // Update cursor to the oldest start_date seen in this page.
    // Strava returns activities newest-first, so the last item in the page
    // is the oldest.
    const oldestStartDate = summaries[summaries.length - 1]?.["start_date"] as
      | string
      | undefined;
    if (oldestStartDate) {
      await db.setBackfillCursor(job.user_id, oldestStartDate);
    }

    // Stop when page is not full (signals end of results)
    if (summaries.length < perPage) {
      break;
    }

    page++;
  }

  // -----------------------------------------------------------------------
  // 6. Mark done
  // -----------------------------------------------------------------------
  await db.setBackfillDone(job.user_id);

  return { imported, window: effectiveWindow };
}
