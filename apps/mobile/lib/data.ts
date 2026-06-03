import { useEffect, useState, useCallback, useRef } from "react";
import type {
  ActivityRow,
  PlanRow,
  PlanWithSync,
  ConnectionRow,
  WeekSummary,
} from "./types";
import { summarizeWeek } from "./stats";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Injectable client interface
//
// Matches the minimal subset of the Supabase client that the fetch functions
// need. Tests pass a simple fake; production code passes the `supabase`
// singleton.
// ---------------------------------------------------------------------------

/** Minimal Supabase-like client shape so tests can inject a fake. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryClient {
  from(table: string): any;
}

// ---------------------------------------------------------------------------
// Fetch functions (injectable — take a QueryClient, return a plain Promise)
// ---------------------------------------------------------------------------

/**
 * Fetches the most recent activities, excluding soft-deleted rows.
 */
export async function fetchRecentActivities(
  client: QueryClient,
  limit = 20
): Promise<ActivityRow[]> {
  const { data, error } = await client
    .from("activities")
    .select(
      "id,strava_activity_id,name,type,start_time,distance_m,moving_time_s,avg_pace_s_per_km,avg_hr,elevation_gain_m,workout_type"
    )
    .is("deleted_at", null)
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/**
 * Fetches all plans ordered by planned_date, and derives the `calendarSynced`
 * and `notionSynced` computed fields.
 */
export async function fetchPlans(client: QueryClient): Promise<PlanWithSync[]> {
  const { data, error } = await client
    .from("plans")
    .select(
      "id,type,planned_date,title,target_distance_m,status,matched_activity_id,calendar_event_id,notion_page_id"
    )
    .order("planned_date", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as PlanRow[]).map((row) => ({
    ...row,
    calendarSynced: !!row.calendar_event_id,
    notionSynced: !!row.notion_page_id,
  }));
}

/**
 * Fetches all third-party connection records.
 */
export async function fetchConnections(
  client: QueryClient
): Promise<ConnectionRow[]> {
  const { data, error } = await client
    .from("connections")
    .select("id,provider,status,config");

  if (error) throw error;
  return (data ?? []) as ConnectionRow[];
}

// ---------------------------------------------------------------------------
// React hooks (use the real supabase singleton — not injectable for brevity)
// ---------------------------------------------------------------------------

/**
 * Returns the user's most recent activities and a reload callback.
 */
export function useActivities(limit = 20): {
  data: ActivityRow[];
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRecentActivities(supabase, limit)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, reload };
}

/**
 * Returns the user's plans (with sync flags) and a reload callback.
 */
export function usePlans(): {
  data: PlanWithSync[];
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<PlanWithSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlans(supabase)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, reload };
}

/**
 * Returns the user's third-party connections.
 */
export function useConnections(): {
  data: ConnectionRow[];
  loading: boolean;
} {
  const [data, setData] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConnections(supabase)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}

/**
 * Returns this week's activity summary (distance, time, count, delta vs last week).
 */
export function useWeekSummary(): {
  summary: WeekSummary;
  loading: boolean;
} {
  const EMPTY: WeekSummary = {
    distanceM: 0,
    movingTimeS: 0,
    count: 0,
    deltaDistancePct: null,
  };
  const [summary, setSummary] = useState<WeekSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch enough activities to cover both this week and last week (last 200
    // is generous; a real user won't log more than ~14 activities in 2 weeks).
    fetchRecentActivities(supabase, 200)
      .then((rows) => {
        if (!cancelled) {
          setSummary(summarizeWeek(rows, new Date().toISOString()));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { summary, loading };
}

/**
 * Fetches a single activity by ID.
 */
export async function fetchActivity(
  client: QueryClient,
  id: string
): Promise<ActivityRow | null> {
  const { data, error } = await client
    .from("activities")
    .select(
      "id,strava_activity_id,name,type,start_time,distance_m,moving_time_s,avg_pace_s_per_km,avg_hr,elevation_gain_m,workout_type"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw error;
  const rows = (data ?? []) as ActivityRow[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Returns a single activity by ID.
 */
export function useActivity(id: string): {
  data: ActivityRow | null;
  loading: boolean;
} {
  const [data, setData] = useState<ActivityRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivity(supabase, id)
      .then((row) => {
        if (!cancelled) {
          setData(row);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, loading };
}

/**
 * Subscribes to INSERT events on the activities table and calls `onChange`
 * whenever a new row arrives. Unsubscribes on unmount.
 */
export function useRealtimeActivities(onChange: () => void): void {
  // Keep a stable ref to the callback so we don't re-subscribe on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const channel = supabase
      .channel("activities-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities" },
        () => onChangeRef.current()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
