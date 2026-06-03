import type { StravaClient } from "./strava";
import type { Db } from "./db";

// ---------------------------------------------------------------------------
// reconcileUser
// ---------------------------------------------------------------------------
// Fetches the recent activity list from Strava for the given user and enqueues
// any activities not already present in the DB into the ingest_queue.
// This is the "dropped-webhook safety net" — it must NOT re-enqueue activities
// that are already ingested (idempotent gap-fill).
// ---------------------------------------------------------------------------
export async function reconcileUser(
  userId: string,
  accessToken: string,
  deps: { strava: StravaClient; db: Db },
  opts?: { days?: number }
): Promise<{ enqueued: number }> {
  const { strava, db } = deps;
  const days = opts?.days ?? 7;

  // Compute the unix epoch lower bound (floor to seconds)
  const afterEpoch = Math.floor((Date.now() - days * 86400 * 1000) / 1000);

  // Fetch recent activity summaries from Strava (one page, 30 results)
  const summaries = await strava.listActivities(
    { afterEpoch, page: 1, perPage: 30 },
    accessToken
  );

  let enqueued = 0;

  for (const summary of summaries) {
    const id = summary["id"] as number;
    const exists = await db.activityExists(userId, id);
    if (!exists) {
      await db.enqueueIngest(userId, id);
      enqueued++;
    }
  }

  return { enqueued };
}
