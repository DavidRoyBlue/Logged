import type { NormalizedActivity, StravaActivityPayload, AthleteZones, ZoneDistribution } from "./types";

/** Seconds per kilometre, or null when distance is zero. */
export function computePaceSPerKm(distanceM: number, movingTimeS: number): number | null {
  if (distanceM <= 0) return null;
  return movingTimeS / (distanceM / 1000);
}

/**
 * Parse the IANA timezone from Strava's timezone string format.
 * Strava returns e.g. "(GMT-05:00) America/New_York" — we extract "America/New_York".
 * If there's no space-delimited tail, return the raw string.
 * If undefined, return "UTC".
 */
function parseTimezone(tz: string | undefined): string {
  if (tz === undefined) return "UTC";
  // Strava format: "(GMT...) IANA/Zone" — find space after the closing paren
  const parenClose = tz.indexOf(")");
  if (parenClose !== -1) {
    const tail = tz.slice(parenClose + 1).trim();
    if (tail.length > 0) return tail;
  }
  return tz;
}

/**
 * Compute zone distribution by bucketing all movingTimeS into the zone that contains avgHr.
 * Returns null when avgHr is null or zones are missing/empty.
 * Zone match: avgHr >= min && (max === -1 || avgHr <= max). First match wins.
 * If avgHr exceeds all finite-max zones, bucket into the last zone.
 * If avgHr is below zone 1 min, bucket into z1 (index 0).
 */
function computeZoneDistribution(
  avgHr: number,
  movingTimeS: number,
  athleteZones: AthleteZones
): ZoneDistribution | null {
  const zones = athleteZones.heart_rate?.zones;
  if (!zones || zones.length === 0) return null;

  // Find first matching zone
  let matchIndex = -1;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (zone === undefined) continue;
    const { min, max } = zone;
    if (avgHr >= min && (max === -1 || avgHr <= max)) {
      matchIndex = i;
      break;
    }
  }

  // If no match found (avgHr below zone 1 min, or above all finite maxes without -1 catch):
  // per spec: below → z1; above all finite → last zone
  if (matchIndex === -1) {
    const firstZone = zones[0];
    if (firstZone !== undefined && avgHr < firstZone.min) {
      matchIndex = 0;
    } else {
      matchIndex = zones.length - 1;
    }
  }

  const result: ZoneDistribution = {
    z1_seconds: 0,
    z2_seconds: 0,
    z3_seconds: 0,
    z4_seconds: 0,
    z5_seconds: 0,
  };

  // Bucket all time into matched zone (up to z5; zones beyond index 4 are ignored)
  const zoneKey = `z${Math.min(matchIndex + 1, 5)}_seconds` as keyof ZoneDistribution;
  result[zoneKey] = movingTimeS;

  return result;
}

/**
 * Normalize a Strava summary or detail activity payload into a canonical NormalizedActivity.
 * Pure function — no I/O.
 */
export function normalize(
  payload: StravaActivityPayload,
  athleteZones?: AthleteZones | null
): NormalizedActivity {
  const startTime =
    payload.start_date ??
    (() => {
      throw new Error("normalize: start_date required");
    })();

  const distanceM = payload.distance ?? 0;
  const movingTimeS = payload.moving_time ?? 0;
  const avgHr = payload.average_heartrate ?? null;

  const zoneDistribution =
    avgHr !== null && athleteZones != null
      ? computeZoneDistribution(avgHr, movingTimeS, athleteZones)
      : null;

  return {
    stravaActivityId: payload.id,
    name: payload.name ?? null,
    type: payload.sport_type ?? payload.type ?? "Workout",
    startTime,
    timezone: parseTimezone(payload.timezone),
    distanceM,
    movingTimeS,
    elapsedTimeS: payload.elapsed_time ?? 0,
    avgPaceSPerKm: computePaceSPerKm(distanceM, movingTimeS),
    avgHr,
    maxHr: payload.max_heartrate ?? null,
    elevationGainM: payload.total_elevation_gain ?? null,
    calories: payload.calories ?? null,
    workoutType: payload.workout_type ?? null,
    zoneDistribution,
  };
}
