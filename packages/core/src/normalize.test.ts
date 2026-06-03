import { describe, it, expect } from "vitest";
import { computePaceSPerKm, normalize } from "./normalize";
import type { StravaActivityPayload, AthleteZones } from "./types";

import summary from "./__fixtures__/summary.json";
import detail from "./__fixtures__/detail.json";
import zones from "./__fixtures__/zones.json";

describe("computePaceSPerKm", () => {
  it("returns seconds per km from distance + moving time", () => {
    expect(computePaceSPerKm(5000, 1500)).toBe(300);
  });
  it("returns null for zero distance", () => {
    expect(computePaceSPerKm(0, 1500)).toBeNull();
  });
});

describe("normalize()", () => {
  describe("summary vs detail", () => {
    it("summary normalizes core fields correctly", () => {
      const act = normalize(summary as StravaActivityPayload);
      expect(act.stravaActivityId).toBe(12345678);
      expect(act.type).toBe("Run");
      expect(act.distanceM).toBe(10000);
      expect(act.movingTimeS).toBe(3000);
      expect(act.elapsedTimeS).toBe(3100);
      expect(act.startTime).toBe("2026-05-02T11:00:00Z");
      expect(act.avgHr).toBe(150);
      expect(act.maxHr).toBe(175);
      expect(act.workoutType).toBe(1);
      expect(act.name).toBe("Morning Run");
    });

    it("summary has null calories", () => {
      const act = normalize(summary as StravaActivityPayload);
      expect(act.calories).toBeNull();
    });

    it("detail has calories 600", () => {
      const act = normalize(detail as StravaActivityPayload);
      expect(act.calories).toBe(600);
    });

    it("summary and detail produce identical core fields except calories", () => {
      const s = normalize(summary as StravaActivityPayload);
      const d = normalize(detail as StravaActivityPayload);
      expect(s.distanceM).toBe(d.distanceM);
      expect(s.movingTimeS).toBe(d.movingTimeS);
      expect(s.type).toBe(d.type);
      expect(s.workoutType).toBe(d.workoutType);
      expect(s.startTime).toBe(d.startTime);
      expect(s.avgHr).toBe(d.avgHr);
    });
  });

  describe("timezone parsing", () => {
    it("parses IANA tail from Strava timezone string", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z", timezone: "(GMT-05:00) America/New_York" });
      expect(act.timezone).toBe("America/New_York");
    });

    it("passes through a raw IANA string with no parenthetical prefix", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z", timezone: "Europe/London" });
      expect(act.timezone).toBe("Europe/London");
    });

    it("returns UTC when timezone is undefined", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z" });
      expect(act.timezone).toBe("UTC");
    });
  });

  describe("avgPaceSPerKm", () => {
    it("computes 300 s/km for 10 km in 3000 s", () => {
      const act = normalize(summary as StravaActivityPayload);
      expect(act.avgPaceSPerKm).toBe(300);
    });

    it("returns null when distance is 0", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z", distance: 0, moving_time: 600 });
      expect(act.avgPaceSPerKm).toBeNull();
    });
  });

  describe("workoutType", () => {
    it("passes through workoutType = 1 (race)", () => {
      const act = normalize(summary as StravaActivityPayload);
      expect(act.workoutType).toBe(1);
    });

    it("is null when absent", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z" });
      expect(act.workoutType).toBeNull();
    });
  });

  describe("zoneDistribution", () => {
    it("buckets avgHr 150 into z3 with all movingTimeS", () => {
      const act = normalize(summary as StravaActivityPayload, zones as AthleteZones);
      expect(act.zoneDistribution).toEqual({
        z1_seconds: 0,
        z2_seconds: 0,
        z3_seconds: 3000,
        z4_seconds: 0,
        z5_seconds: 0,
      });
    });

    it("returns null when avgHr is null", () => {
      const act = normalize(
        { id: 1, start_date: "2026-01-01T00:00:00Z", moving_time: 3000 },
        zones as AthleteZones
      );
      expect(act.zoneDistribution).toBeNull();
    });

    it("returns null when athleteZones is null", () => {
      const act = normalize(summary as StravaActivityPayload, null);
      expect(act.zoneDistribution).toBeNull();
    });

    it("returns null when athleteZones is omitted", () => {
      const act = normalize(summary as StravaActivityPayload);
      expect(act.zoneDistribution).toBeNull();
    });

    it("returns null when zones array is empty", () => {
      const emptyZones: AthleteZones = { heart_rate: { zones: [] } };
      const act = normalize(summary as StravaActivityPayload, emptyZones);
      expect(act.zoneDistribution).toBeNull();
    });

    it("returns null when heart_rate key is missing", () => {
      const noHr: AthleteZones = {};
      const act = normalize(summary as StravaActivityPayload, noHr);
      expect(act.zoneDistribution).toBeNull();
    });

    it("buckets avgHr 200 (above all finite maxes) into z5 (last zone has max -1)", () => {
      const act = normalize(
        { id: 1, start_date: "2026-01-01T00:00:00Z", average_heartrate: 200, moving_time: 3000 },
        zones as AthleteZones
      );
      expect(act.zoneDistribution).toEqual({
        z1_seconds: 0,
        z2_seconds: 0,
        z3_seconds: 0,
        z4_seconds: 0,
        z5_seconds: 3000,
      });
    });

    it("buckets avgHr below zone 1 min into z1", () => {
      // zones start at 0, so avgHr 50 still falls in z1 (min:0, max:120)
      const act = normalize(
        { id: 1, start_date: "2026-01-01T00:00:00Z", average_heartrate: 50, moving_time: 1000 },
        zones as AthleteZones
      );
      expect(act.zoneDistribution?.z1_seconds).toBe(1000);
    });
  });

  describe("missing start_date", () => {
    it("throws when start_date is absent", () => {
      expect(() => normalize({ id: 1 })).toThrow("normalize: start_date required");
    });
  });

  describe("type fallback", () => {
    it("uses sport_type when present", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z", sport_type: "TrailRun", type: "Run" });
      expect(act.type).toBe("TrailRun");
    });

    it("falls back to type when sport_type absent", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z", type: "Ride" });
      expect(act.type).toBe("Ride");
    });

    it("defaults to Workout when neither present", () => {
      const act = normalize({ id: 1, start_date: "2026-01-01T00:00:00Z" });
      expect(act.type).toBe("Workout");
    });
  });
});
