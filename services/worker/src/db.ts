import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedActivity, AthleteZones, PlannedSession } from "@logged/core";
import type { StravaTokens } from "./strava";

// ---------------------------------------------------------------------------
// Types returned by Db methods
// ---------------------------------------------------------------------------
export interface Profile {
  tier: "free" | "pro";
  backfillStatus: string;
}

export interface StravaConnection {
  id: string;
  externalAccountId: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  status: string;
}

// pgmq message_record shape (partial)
export interface QueueMessage {
  msg_id: bigint | number;
  message: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Db class
// ---------------------------------------------------------------------------
export class Db {
  private readonly client: SupabaseClient;

  constructor(opts?: { url?: string; serviceRoleKey?: string }) {
    const url = opts?.url ?? process.env["SUPABASE_URL"] ?? "";
    const key = opts?.serviceRoleKey ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  // -------------------------------------------------------------------------
  // getStravaConnection
  // Decrypts access_token and refresh_token via rpc('decrypt_token').
  // -------------------------------------------------------------------------
  async getStravaConnection(userId: string): Promise<StravaConnection | null> {
    const { data, error } = await this.client
      .from("connections")
      .select("id, external_account_id, access_token, refresh_token, expires_at, status")
      .eq("user_id", userId)
      .eq("provider", "strava")
      .single();

    if (error || !data) return null;

    // Decrypt access_token
    const { data: accessToken, error: aErr } = await this.client.rpc("decrypt_token", {
      cipher: data.access_token,
    });
    if (aErr) throw new Error(`decrypt access_token: ${aErr.message}`);

    // Decrypt refresh_token (may be null)
    let refreshToken: string | null = null;
    if (data.refresh_token) {
      const { data: rt, error: rErr } = await this.client.rpc("decrypt_token", {
        cipher: data.refresh_token,
      });
      if (rErr) throw new Error(`decrypt refresh_token: ${rErr.message}`);
      refreshToken = rt as string | null;
    }

    return {
      id: data.id as string,
      externalAccountId: data.external_account_id as string | null,
      accessToken: accessToken as string,
      refreshToken,
      expiresAt: data.expires_at as string | null,
      status: data.status as string,
    };
  }

  // -------------------------------------------------------------------------
  // updateConnectionTokens
  // Re-encrypts the tokens via rpc('encrypt_token') then updates the row.
  // -------------------------------------------------------------------------
  async updateConnectionTokens(connectionId: string, tokens: StravaTokens): Promise<void> {
    // Encrypt new access token
    const { data: encAccess, error: encAErr } = await this.client.rpc("encrypt_token", {
      plain: tokens.accessToken,
    });
    if (encAErr) throw new Error(`encrypt access_token: ${encAErr.message}`);

    // Encrypt new refresh token (may be null)
    let encRefresh: string | null = null;
    if (tokens.refreshToken) {
      const { data: er, error: encRErr } = await this.client.rpc("encrypt_token", {
        plain: tokens.refreshToken,
      });
      if (encRErr) throw new Error(`encrypt refresh_token: ${encRErr.message}`);
      encRefresh = er as string | null;
    }

    const { error } = await this.client
      .from("connections")
      .update({
        access_token: encAccess,
        refresh_token: encRefresh,
        expires_at: tokens.expiresAt,
      })
      .eq("id", connectionId);

    if (error) throw new Error(`updateConnectionTokens: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // getAthleteZones — reads profiles.athlete_zones
  // -------------------------------------------------------------------------
  async getAthleteZones(userId: string): Promise<AthleteZones | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("athlete_zones")
      .eq("id", userId)
      .single();

    if (error || !data) return null;
    return (data.athlete_zones as AthleteZones) ?? null;
  }

  // -------------------------------------------------------------------------
  // upsertActivity — inserts or updates on (user_id, strava_activity_id)
  // -------------------------------------------------------------------------
  async upsertActivity(
    userId: string,
    normalized: NormalizedActivity,
    raw: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client.from("activities").upsert(
      {
        user_id: userId,
        strava_activity_id: normalized.stravaActivityId,
        type: normalized.type,
        start_time: normalized.startTime,
        timezone: normalized.timezone,
        distance_m: normalized.distanceM,
        moving_time_s: normalized.movingTimeS,
        elapsed_time_s: normalized.elapsedTimeS,
        avg_pace_s_per_km: normalized.avgPaceSPerKm,
        avg_hr: normalized.avgHr,
        max_hr: normalized.maxHr,
        elevation_gain_m: normalized.elevationGainM,
        calories: normalized.calories,
        name: normalized.name,
        workout_type: normalized.workoutType,
        zone_distribution: normalized.zoneDistribution,
        raw,
        deleted_at: null, // un-delete on re-ingest
      },
      { onConflict: "user_id,strava_activity_id" }
    );

    if (error) throw new Error(`upsertActivity: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // enqueueSync — sends a message to the sync_queue
  // -------------------------------------------------------------------------
  async enqueueSync(userId: string, stravaActivityId: number): Promise<void> {
    const { error } = await this.client.rpc("pgmq_send", {
      queue_name: "sync_queue",
      msg: { user_id: userId, strava_activity_id: stravaActivityId },
    });
    if (error) throw new Error(`enqueueSync: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // softDeleteActivity
  // -------------------------------------------------------------------------
  async softDeleteActivity(userId: string, stravaActivityId: number): Promise<void> {
    const { error } = await this.client.rpc("soft_delete_activity", {
      p_user_id: userId,
      p_strava_activity_id: stravaActivityId,
    });
    if (error) throw new Error(`softDeleteActivity: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // readQueue — reads up to qty messages from a pgmq queue (vt=30s)
  // -------------------------------------------------------------------------
  async readQueue(queue: string, qty: number): Promise<QueueMessage[]> {
    const { data, error } = await this.client.rpc("pgmq_read", {
      queue_name: queue,
      vt: 30,
      qty,
    });
    if (error) throw new Error(`readQueue(${queue}): ${error.message}`);
    return (data as QueueMessage[]) ?? [];
  }

  // -------------------------------------------------------------------------
  // enqueueIngest — sends a message to the ingest_queue
  // -------------------------------------------------------------------------
  async enqueueIngest(
    userId: string,
    stravaActivityId: number,
    op: "create" | "update" | "delete" = "create"
  ): Promise<void> {
    const { error } = await this.client.rpc("pgmq_send", {
      queue_name: "ingest_queue",
      msg: { user_id: userId, strava_activity_id: stravaActivityId, op },
    });
    if (error) throw new Error(`enqueueIngest: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // activityExists — returns true if (user_id, strava_activity_id) exists and
  // is not soft-deleted
  // -------------------------------------------------------------------------
  async activityExists(userId: string, stravaActivityId: number): Promise<boolean> {
    const { data, error } = await this.client
      .from("activities")
      .select("id")
      .eq("user_id", userId)
      .eq("strava_activity_id", stravaActivityId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(`activityExists: ${error.message}`);
    return data !== null;
  }

  // -------------------------------------------------------------------------
  // purgeQueue — removes all messages from a pgmq queue; returns count purged
  // -------------------------------------------------------------------------
  async purgeQueue(queue: string): Promise<bigint> {
    const { data, error } = await this.client.rpc("pgmq_purge", {
      queue_name: queue,
    });
    if (error) throw new Error(`purgeQueue(${queue}): ${error.message}`);
    return BigInt(data as number);
  }

  // -------------------------------------------------------------------------
  // purgeAllQueues — convenience: purges ingest_queue, sync_queue, plan_push_queue
  // -------------------------------------------------------------------------
  async purgeAllQueues(): Promise<void> {
    await Promise.all([
      this.purgeQueue("ingest_queue"),
      this.purgeQueue("sync_queue"),
      this.purgeQueue("plan_push_queue"),
    ]);
  }

  // -------------------------------------------------------------------------
  // deleteMsg — removes a message from the queue (ack)
  // -------------------------------------------------------------------------
  async deleteMsg(queue: string, msgId: bigint | number): Promise<void> {
    const { error } = await this.client.rpc("pgmq_delete", {
      queue_name: queue,
      msg_id: msgId,
    });
    if (error) throw new Error(`deleteMsg(${queue}, ${msgId}): ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // getActivityForSync — load non-deleted activity and map to NormalizedActivity
  // -------------------------------------------------------------------------
  async getActivityForSync(
    userId: string,
    stravaActivityId: number
  ): Promise<{ activityId: string; normalized: NormalizedActivity } | null> {
    const { data, error } = await this.client
      .from("activities")
      .select(
        "id, strava_activity_id, type, start_time, timezone, distance_m, moving_time_s, elapsed_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m, calories, name, workout_type, zone_distribution"
      )
      .eq("user_id", userId)
      .eq("strava_activity_id", stravaActivityId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(`getActivityForSync: ${error.message}`);
    if (!data) return null;

    const normalized: NormalizedActivity = {
      stravaActivityId: data.strava_activity_id as number,
      type: data.type as string,
      startTime: data.start_time as string,
      timezone: data.timezone as string,
      distanceM: data.distance_m as number,
      movingTimeS: data.moving_time_s as number,
      elapsedTimeS: data.elapsed_time_s as number,
      avgPaceSPerKm: data.avg_pace_s_per_km as number | null,
      avgHr: data.avg_hr as number | null,
      maxHr: data.max_hr as number | null,
      elevationGainM: data.elevation_gain_m as number | null,
      calories: data.calories as number | null,
      name: data.name as string | null,
      workoutType: data.workout_type as number | null,
      zoneDistribution: data.zone_distribution as NormalizedActivity["zoneDistribution"],
    };

    return { activityId: data.id as string, normalized };
  }

  // -------------------------------------------------------------------------
  // getPendingPlansInWindow — pending plans within ±2 days of the activity date
  // -------------------------------------------------------------------------
  async getPendingPlansInWindow(userId: string, startIso: string): Promise<PlannedSession[]> {
    const actDate = new Date(startIso);
    const from = new Date(actDate.getTime() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = new Date(actDate.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const { data, error } = await this.client
      .from("planned_sessions")
      .select("id, type, planned_date, target_distance_m, status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gte("planned_date", from)
      .lte("planned_date", to);

    if (error) throw new Error(`getPendingPlansInWindow: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      type: row.type as string,
      plannedDate: row.planned_date as string,
      targetDistanceM: row.target_distance_m as number | null,
      status: row.status as PlannedSession["status"],
    }));
  }

  // -------------------------------------------------------------------------
  // getActiveOutboundConnections — active non-strava outbound connections
  // -------------------------------------------------------------------------
  async getActiveOutboundConnections(
    userId: string
  ): Promise<{ id: string; provider: "google_calendar" | "notion"; config: unknown }[]> {
    const { data, error } = await this.client
      .from("connections")
      .select("id, provider, config")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("provider", ["google_calendar", "notion"]);

    if (error) throw new Error(`getActiveOutboundConnections: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      provider: row.provider as "google_calendar" | "notion",
      config: row.config,
    }));
  }

  // -------------------------------------------------------------------------
  // getPlan — load a planned_sessions row by id
  // -------------------------------------------------------------------------
  async getPlan(planId: string): Promise<{
    id: string;
    userId: string;
    title: string;
    description: string | null;
    type: string;
    plannedDate: string;
    targetDistanceM: number | null;
    calendarEventId: string | null;
    notionPageId: string | null;
  } | null> {
    const { data, error } = await this.client
      .from("planned_sessions")
      .select(
        "id, user_id, title, description, type, planned_date, target_distance_m, calendar_event_id, notion_page_id"
      )
      .eq("id", planId)
      .maybeSingle();

    if (error) throw new Error(`getPlan: ${error.message}`);
    if (!data) return null;

    return {
      id: data.id as string,
      userId: data.user_id as string,
      title: data.title as string,
      description: data.description as string | null,
      type: data.type as string,
      plannedDate: data.planned_date as string,
      targetDistanceM: data.target_distance_m as number | null,
      calendarEventId: data.calendar_event_id as string | null,
      notionPageId: data.notion_page_id as string | null,
    };
  }

  // -------------------------------------------------------------------------
  // setPlanRef — store the external ref for a plan+provider combo
  // -------------------------------------------------------------------------
  async setPlanRef(
    planId: string,
    provider: "google_calendar" | "notion",
    ref: string
  ): Promise<void> {
    const column =
      provider === "google_calendar" ? "calendar_event_id" : "notion_page_id";
    const { error } = await this.client
      .from("planned_sessions")
      .update({ [column]: ref })
      .eq("id", planId);

    if (error) throw new Error(`setPlanRef: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // deletePlan — remove a planned_sessions row
  // -------------------------------------------------------------------------
  async deletePlan(planId: string): Promise<void> {
    const { error } = await this.client
      .from("planned_sessions")
      .delete()
      .eq("id", planId);

    if (error) throw new Error(`deletePlan: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // getPlanRef — get the stored external ref for a plan+provider combo
  // -------------------------------------------------------------------------
  async getPlanRef(planId: string, provider: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("planned_sessions")
      .select("calendar_event_id, notion_page_id")
      .eq("id", planId)
      .maybeSingle();

    if (error) throw new Error(`getPlanRef: ${error.message}`);
    if (!data) return null;

    const ref =
      provider === "google_calendar"
        ? (data.calendar_event_id as string | null)
        : (data.notion_page_id as string | null);

    return ref ?? null;
  }

  // -------------------------------------------------------------------------
  // completePlan — mark plan as completed and set matched_activity_id
  // -------------------------------------------------------------------------
  async completePlan(planId: string, activityId: string): Promise<void> {
    const { error } = await this.client
      .from("planned_sessions")
      .update({ status: "completed", matched_activity_id: activityId })
      .eq("id", planId);

    if (error) throw new Error(`completePlan: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // hasOkOutbound — check if an outbound_records row with status='ok' exists
  // -------------------------------------------------------------------------
  async hasOkOutbound(activityId: string, connectionId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("outbound_records")
      .select("id")
      .eq("activity_id", activityId)
      .eq("connection_id", connectionId)
      .eq("status", "ok")
      .maybeSingle();

    if (error) throw new Error(`hasOkOutbound: ${error.message}`);
    return data !== null;
  }

  // -------------------------------------------------------------------------
  // recordOutbound — upsert outbound_records row
  // -------------------------------------------------------------------------
  async recordOutbound(
    userId: string,
    activityId: string,
    connectionId: string,
    externalRef: string | null,
    action: "completed_plan" | "logged_new",
    status: "ok" | "failed",
    error?: string
  ): Promise<void> {
    const { error: dbErr } = await this.client.from("outbound_records").upsert(
      {
        user_id: userId,
        activity_id: activityId,
        connection_id: connectionId,
        external_ref: externalRef,
        action,
        status,
        synced_at: new Date().toISOString(),
        error: error ?? null,
      },
      { onConflict: "activity_id,connection_id" }
    );
    if (dbErr) throw new Error(`recordOutbound: ${dbErr.message}`);
  }

  // -------------------------------------------------------------------------
  // getProfile — reads tier and backfill_status from profiles
  // -------------------------------------------------------------------------
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("tier, backfill_status")
      .eq("id", userId)
      .single();

    if (error || !data) return null;
    return {
      tier: data.tier as "free" | "pro",
      backfillStatus: data.backfill_status as string,
    };
  }

  // -------------------------------------------------------------------------
  // setBackfillRunning — set backfill_status='running', record window+timestamp
  // -------------------------------------------------------------------------
  async setBackfillRunning(userId: string, window: "90d" | "full"): Promise<void> {
    const { error } = await this.client
      .from("profiles")
      .update({
        backfill_status: "running",
        backfill_window: window,
        backfill_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw new Error(`setBackfillRunning: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // setBackfillCursor — update cursor after each page
  // -------------------------------------------------------------------------
  async setBackfillCursor(userId: string, cursorIso: string): Promise<void> {
    const { error } = await this.client
      .from("profiles")
      .update({
        backfill_cursor: cursorIso,
        backfill_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw new Error(`setBackfillCursor: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // setBackfillDone — mark backfill complete
  // -------------------------------------------------------------------------
  async setBackfillDone(userId: string): Promise<void> {
    const { error } = await this.client
      .from("profiles")
      .update({
        backfill_status: "done",
        backfill_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw new Error(`setBackfillDone: ${error.message}`);
  }
}
