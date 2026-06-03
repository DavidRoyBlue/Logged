# Logged Layer 0 — Plan 4: Sync Loop Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every task.

**Goal:** Close the loop — match a completed activity to a planned session and fan it out to Calendar + Notion (complete-or-log), plus push app-created plans outward, with revert.

**Architecture:** `matcher()` is pure in `@logged/core`. Outbound adapters implement a shared `OutboundDestination` contract in `@logged/worker/src/adapters/` with INJECTED API clients (faked in tests). The sync worker (matcher + adapters, idempotent via `outbound_records`) and the plan-push worker live in `@logged/worker`, integration-tested against the live local Supabase with fake adapters/clients.

---

## Tasks

### T1 — `matcher()` full implementation (`@logged/core`)
- `matcher(activity: NormalizedActivity, candidates: PlannedSession[]): MatchResult`.
- A candidate qualifies if: `status==='pending'`, `withinWindow(plannedDate, activity.startTime, 36)`, type-compatible (equal, or both in the run-family `{Run,TrailRun}`), and — if the plan has `targetDistanceM` — the activity distance is within ±50% (else disqualified as too far).
- Score = `0.6*dateScore + 0.4*distScore` where `dateScore = 1 - hoursDiff/36`, `distScore = targetDistanceM ? max(0,1-|actDist-target|/target) : 0.5`.
- Best qualifying candidate → `{action:'completed_plan', planId, confidence: score}`; none → `{action:'logged_new'}`. Ties broken by score, then earliest `plannedDate`, then `id`.
- Exhaustive unit tests: in-window same-type match; outside window → logged_new; type mismatch → logged_new; two same-day plans → closer distance wins; plan with no target → neutral dist; distance >50% off → disqualified → logged_new; confidence in (0,1].

### T2 — Outbound adapters (`@logged/worker/src/adapters/`)
- `OutboundDestination` (from `@logged/core`): `apply(activity, match) -> {externalRef}` and `revert({externalRef, action}) -> void`.
- `CalendarClient` / `NotionClient` interfaces (createEvent/updateEvent/deleteEvent; createPage/updatePage/archivePage) + Fakes recording calls.
- `CalendarAdapter`: `apply` — `completed_plan` with a known ref → updateEvent (✅ title + actuals); `completed_plan` with null ref → createEvent-as-completed (the safety net); `logged_new` → createEvent. `revert` — `completed_plan` → updateEvent back to un-completed (NOT delete); `logged_new` → deleteEvent.
- `NotionAdapter`: analogous (Status=Done + actuals on update; create page; revert un-completes vs archives).
- Unit tests with fake clients: each apply branch and both revert branches; assert the fake received the right call.

### T3 — Sync worker (`@logged/worker`)
- Add Db methods: `getActivityById`, `getPendingPlansInWindow(userId, startIso, hours)`, `getActiveOutboundConnections(userId)` (google_calendar/notion with config), `recordOutbound(...)` (upsert outbound_records on (activity_id,connection_id) with externalRef/action/status/retry), `completePlan(planId, activityId)`, `getPlanRefs(planId)`.
- `processSyncJob({user_id, strava_activity_id}, {db, adapters})`: load activity; load pending plans in ±36h; `matcher`; if completed_plan → `completePlan`; for each active outbound connection, pick the adapter, `apply(activity, match)` (pass the plan's existing ref for that destination when completing), `recordOutbound`. Idempotent: skip/refresh if an `ok` outbound_record already exists for (activity, connection).
- Integration test (live DB + fake adapters): activity matching a pending plan → plan becomes completed + outbound_records (ok) for calendar+notion with action completed_plan; activity with no plan → logged_new records; re-run is idempotent (no duplicate records).

### T4 — Plan-push worker (`@logged/worker`)
- `processPlanPush({user_id, plan_id, op}, {db, adapters})`: `op` create → for each active outbound connection, `apply` a synthetic "planned" entry (adapter `createPlanned(plan)`) → store the ref on planned_sessions (`calendar_event_id`/`notion_page_id`); edit → update via stored ref; delete → delete via ref + remove session; revert → restore the plan event to un-completed (uses adapter.revert on the completed plan).
- Add adapter `createPlanned(plan)`/`updatePlanned`/`deletePlanned` + Db `setPlanRef(planId, provider, ref)`.
- Integration test: create op with an active notion connection → a notion_page_id stored on the plan + fake NotionClient.createPage called; revert op → adapter revert invoked.

## Self-review
matcher pure + exhaustive; adapters cover all apply/revert branches incl null-ref create-as-completed; sync idempotent via outbound_records unique; plan-push stores refs + handles revert. External Calendar/Notion APIs faked; integration against live DB.
