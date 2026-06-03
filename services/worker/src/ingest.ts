import { normalize } from "@logged/core";
import type { StravaClient } from "./strava";
import type { Db } from "./db";

// ---------------------------------------------------------------------------
// Configurable set of allowed Strava sport types for ingest.
// ---------------------------------------------------------------------------
export const ALLOWED_TYPES = new Set(["Run", "TrailRun", "Workout"]);

// ---------------------------------------------------------------------------
// Job shape
// ---------------------------------------------------------------------------
export interface IngestJob {
  user_id: string;
  strava_activity_id: number;
  op: string;
}

// ---------------------------------------------------------------------------
// processIngestJob
// ---------------------------------------------------------------------------
export type IngestResult = "deleted" | "ingested" | "dropped" | "skipped";

export async function processIngestJob(
  job: IngestJob,
  deps: { strava: StravaClient; db: Db }
): Promise<IngestResult> {
  const { strava, db } = deps;

  // ------- delete op -------------------------------------------------------
  if (job.op === "delete") {
    await db.softDeleteActivity(job.user_id, job.strava_activity_id);
    return "deleted";
  }

  // ------- load connection --------------------------------------------------
  const conn = await db.getStravaConnection(job.user_id);
  if (!conn || conn.status !== "active") {
    return "skipped";
  }

  // ------- refresh-on-use --------------------------------------------------
  let accessToken = conn.accessToken;
  const needsRefresh =
    conn.refreshToken !== null &&
    (conn.expiresAt === null ||
      new Date(conn.expiresAt).getTime() - Date.now() < 5 * 60 * 1000);

  if (needsRefresh && conn.refreshToken !== null) {
    const newTokens = await strava.refreshToken(conn.refreshToken);
    await db.updateConnectionTokens(conn.id, newTokens);
    accessToken = newTokens.accessToken;
  }

  // ------- fetch from Strava ------------------------------------------------
  const raw = await strava.getActivity(job.strava_activity_id, accessToken);

  // ------- type filter ------------------------------------------------------
  const sportType =
    (raw["sport_type"] as string | undefined) ?? (raw["type"] as string | undefined);
  if (!sportType || !ALLOWED_TYPES.has(sportType)) {
    return "dropped";
  }

  // ------- normalize + upsert -----------------------------------------------
  const zones = await db.getAthleteZones(job.user_id);
  const normalized = normalize(raw as Parameters<typeof normalize>[0], zones);

  await db.upsertActivity(job.user_id, normalized, raw);
  await db.enqueueSync(job.user_id, job.strava_activity_id);

  return "ingested";
}

// ---------------------------------------------------------------------------
// drainIngestQueue
// ---------------------------------------------------------------------------
export async function drainIngestQueue(
  deps: { strava: StravaClient; db: Db },
  max = 20
): Promise<number> {
  const messages = await deps.db.readQueue("ingest_queue", max);
  let count = 0;

  for (const msg of messages) {
    const job = msg.message as unknown as IngestJob;
    await processIngestJob(job, deps);
    await deps.db.deleteMsg("ingest_queue", msg.msg_id);
    count++;
  }

  return count;
}
