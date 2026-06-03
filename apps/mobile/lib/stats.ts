import type { WeekSummary } from "./types";

/**
 * Returns the UTC timestamp (ms) of the Monday 00:00:00 UTC that starts the
 * ISO week containing `date`.
 *
 * ISO week: weeks start on Monday (day 1).  JavaScript's getUTCDay() returns
 * 0=Sunday…6=Saturday, so we remap to 0=Monday…6=Sunday by treating Sunday
 * as day 6 (i.e. offset = (getUTCDay() + 6) % 7).
 */
function weekStartMs(date: Date): number {
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  const ms =
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ) -
    dayOfWeek * 24 * 60 * 60 * 1000;
  return ms;
}

/**
 * Summarise running activities for the current ISO week and compute a
 * week-over-week distance change percentage.
 *
 * @param activities  List of activity objects (any superset of the required fields).
 * @param nowIso      ISO-8601 string representing "now" (UTC).  Injected so the
 *                    function stays pure and deterministic in tests.
 */
export function summarizeWeek(
  activities: { start_time: string; distance_m: number; moving_time_s: number }[],
  nowIso: string
): WeekSummary {
  const now = new Date(nowIso);
  const thisWeekStart = weekStartMs(now);
  const nextWeekStart = thisWeekStart + 7 * 24 * 60 * 60 * 1000;
  const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;

  let thisDistanceM = 0;
  let thisMovingTimeS = 0;
  let thisCount = 0;
  let lastDistanceM = 0;

  for (const a of activities) {
    const ts = new Date(a.start_time).getTime();
    if (ts >= thisWeekStart && ts < nextWeekStart) {
      thisDistanceM += a.distance_m;
      thisMovingTimeS += a.moving_time_s;
      thisCount += 1;
    } else if (ts >= lastWeekStart && ts < thisWeekStart) {
      lastDistanceM += a.distance_m;
    }
  }

  const deltaDistancePct =
    lastDistanceM === 0
      ? null
      : ((thisDistanceM - lastDistanceM) / lastDistanceM) * 100;

  return {
    distanceM: thisDistanceM,
    movingTimeS: thisMovingTimeS,
    count: thisCount,
    deltaDistancePct,
  };
}
