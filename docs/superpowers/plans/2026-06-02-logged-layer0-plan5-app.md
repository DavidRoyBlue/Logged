# Logged Layer 0 — Plan 5: Expo WIRED Screens Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD every task.

**Goal:** Replace the WIRED tab shells with real screens fed by Supabase data + Realtime: Home (this-week + recent feed), Activities (feed + detail), Plans (list + create), Settings/Connections. SHELL screens stay `ComingSoon`.

**Architecture:** A pure stats summarizer + data hooks over the Supabase client (`apps/mobile/lib/`). Screens render hook data. Tests: the summarizer is pure-unit; hooks/screens are tested with a mocked `../lib/supabase` returning canned rows (jest + @testing-library/react-native). Realtime via `supabase.channel(...)`.

---

## Tasks

### T1 — Data layer (`apps/mobile/lib/`)
- `lib/stats.ts` — pure `summarizeWeek(activities, nowIso)`: returns `{ distanceM, movingTimeS, count, deltaDistancePct }` for the current ISO week vs the prior week (deltaDistancePct = (thisWk-lastWk)/lastWk*100, null if lastWk 0). Pure, exhaustively unit-tested.
- `lib/data.ts` — hooks over the supabase client:
  - `useActivities(limit?)` → `{ data: ActivityRow[]; loading }` (select from activities, order start_time desc, not deleted).
  - `useActivity(id)` → a single activity.
  - `usePlans()` → planned_sessions ordered by planned_date, with derived per-destination sync state (synced if calendar_event_id/notion_page_id present).
  - `useConnections()` → connections rows (provider, status, config).
  - `useWeekSummary()` → uses useActivities + summarizeWeek.
  Each hook reads `supabase` (the singleton). Type the row shapes in `lib/types.ts`.
- Tests: `stats.test.ts` (pure: empty, this-week-only, with-prior-week delta, null delta). `data.test.ts` — mock `../lib/supabase` so `.from().select()...` resolves canned rows; assert each hook surfaces them and `loading` transitions.

### T2 — WIRED screens + Realtime
- Replace the `(tabs)` WIRED screens (keep SHELL ones as ComingSoon):
  - `app/(tabs)/index.tsx` (Home): a `WeekCard` (distance/time/count + Δ), a recent activities list (`ActivityRow` rows: name, date, distance km, pace, ✅ if it completed a plan), subscribed to Realtime so a new activity appears.
  - `app/(tabs)/activities.tsx`: the full feed; tapping a row routes to `app/activity/[id].tsx` (detail: distance, pace, HR, elevation, "completed <plan>" if matched, race badge if workout_type===1).
  - `app/(tabs)/plans.tsx`: list of plans grouped pending/completed/missed with per-destination sync badges; a "New plan" button → `app/plan/new.tsx` (form: title, type, date, target distance) that inserts a planned_sessions row (RLS allows user writes) — insertion is enough for Layer 0 (the plan-push worker handles external push server-side).
  - `app/(tabs)/settings.tsx` (Connections): connection status cards (active / pending_config "finish setup" / expired "reconnect") with Connect buttons (call `connect()` from lib/auth for calendar/notion; `signInWithStrava` if no strava), and a tier-gated **Import full history** button.
- Components in `apps/mobile/components/`: `WeekCard`, `ActivityListItem`, `PlanListItem`, `ConnectionCard`. Small, focused, prop-driven (so they're trivially testable without data).
- Realtime: a `useRealtimeActivities(onChange)` hook subscribing to `postgres_changes` on `activities`; Home re-fetches on insert.
- Tests (RTL, mock `../../lib/data` or `../../lib/supabase`):
  - `WeekCard` renders distance/Δ from props.
  - `ActivityListItem` shows name + km + ✅ when matched.
  - Home renders a provided list of activities + the week summary (mock the hooks).
  - `ConnectionCard` shows the right CTA per status (active vs pending_config vs missing).
  - Plans screen groups by status; the new-plan form calls insert on submit (mock supabase insert).

## Self-review
summarizeWeek pure + tested; hooks surface canned data under mock; WIRED screens render real data and keep SHELL screens as ComingSoon; components prop-driven + unit-tested; Realtime hook subscribes/unsubscribes cleanly; no hardcoded keys. Other packages unaffected.
