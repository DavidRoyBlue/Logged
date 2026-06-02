import type { NormalizedActivity } from "./types";

/** Seconds per kilometre, or null when distance is zero. */
export function computePaceSPerKm(distanceM: number, movingTimeS: number): number | null {
  if (distanceM <= 0) return null;
  return movingTimeS / (distanceM / 1000);
}

/** Full normalize() (summary OR detail payload -> NormalizedActivity) is implemented in Plan 3. */
export function normalize(_payload: unknown): NormalizedActivity {
  throw new Error("normalize() is implemented in Plan 3 (Ingestion)");
}
