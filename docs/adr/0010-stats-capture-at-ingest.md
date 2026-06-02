# ADR 0010: Stats Data Capture at Ingest

- Status: Accepted
- Date: 2026-06-02

## Context

Logged will eventually display training load analytics: race detection, heart rate zone distribution, and athlete zone history. These visualizations are scheduled for a later layer, not Layer 0. However, the underlying data must be captured at ingest time — once an activity is ingested without a piece of metadata, retrieving it requires a separate Strava API call per activity, which is expensive for large backlogs and subject to Strava's rate limits.

## Decision

At Layer 0 ingest, capture the following fields even though the visualizations that use them ship later:

- **`workout_type`**: Strava's activity type enum, used for race detection (e.g., `workout_type === 1` = race).
- **`zone_distribution`** (approximate): computed from `average_heartrate` + the athlete's HR zones fetched at ingest time. This is an approximation; exact zone distribution requires HR streams (Layer 1).
- **`athlete_zones`**: snapshot of the athlete's HR zone boundaries at the time of the activity, stored alongside the activity so future recalculations use period-accurate zones.

## Consequences

- Layer 1 visualizations can be built on existing data without a re-ingestion pass.
- Athlete zone snapshots add a small amount of storage per activity but avoid the need to reconstruct historical zone boundaries later.
- The approximate `zone_distribution` from average HR will be superseded by an exact calculation from HR streams in Layer 1 — the column must be designed to be overwritten.
- Fetching `athlete_zones` at ingest requires an additional Strava API call; this must be cached aggressively (zones rarely change) to avoid rate limit pressure.
