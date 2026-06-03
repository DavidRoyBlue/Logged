import type { NormalizedActivity, PlannedSession, MatchResult } from "./types";

/** True when a plan's date falls within ±hours of the activity start time. */
export function withinWindow(plannedDate: string, activityStartIso: string, hours: number): boolean {
  const planMs = new Date(`${plannedDate}T12:00:00Z`).getTime();
  const actMs = new Date(activityStartIso).getTime();
  return Math.abs(planMs - actMs) <= hours * 3600 * 1000;
}

/** Activity types that are interchangeable for matching purposes. */
const RUN_FAMILY = new Set(["Run", "TrailRun"]);

/** True when two activity types are compatible for matching. */
function typesCompatible(activityType: string, planType: string): boolean {
  if (activityType === planType) return true;
  return RUN_FAMILY.has(activityType) && RUN_FAMILY.has(planType);
}

/** True when the activity distance is within ±50% of the plan target. */
function distanceQualifies(distanceM: number, targetDistanceM: number | null): boolean {
  if (targetDistanceM === null) return true;
  return Math.abs(distanceM - targetDistanceM) / targetDistanceM <= 0.5;
}

interface ScoredCandidate {
  plan: PlannedSession;
  score: number;
}

/** Score a qualifying candidate against the activity. */
function scoreCandidate(activity: NormalizedActivity, plan: PlannedSession): number {
  const planNoonMs = new Date(`${plan.plannedDate}T12:00:00Z`).getTime();
  const actMs = new Date(activity.startTime).getTime();
  const hoursDiff = Math.abs(planNoonMs - actMs) / 3600000;

  const dateScore = Math.max(0, 1 - hoursDiff / 36);
  const distScore =
    plan.targetDistanceM !== null
      ? Math.max(0, 1 - Math.abs(activity.distanceM - plan.targetDistanceM) / plan.targetDistanceM)
      : 0.5;

  return 0.6 * dateScore + 0.4 * distScore;
}

/**
 * Match an activity against a set of planned sessions.
 *
 * Qualification rules (all must hold):
 *  1. status === 'pending'
 *  2. within ±36h window (plan date anchored at noon UTC)
 *  3. type-compatible (exact or both in RUN_FAMILY)
 *  4. distance within ±50% of target (or no target)
 *
 * Scoring: 0.6 * dateScore + 0.4 * distScore
 * Tie-break: highest score → earliest plannedDate (lex) → lowest id (lex)
 */
export function matcher(activity: NormalizedActivity, candidates: PlannedSession[]): MatchResult {
  const qualifiers: ScoredCandidate[] = [];

  for (const plan of candidates) {
    if (plan.status !== "pending") continue;
    if (!withinWindow(plan.plannedDate, activity.startTime, 36)) continue;
    if (!typesCompatible(activity.type, plan.type)) continue;
    if (!distanceQualifies(activity.distanceM, plan.targetDistanceM)) continue;

    qualifiers.push({ plan, score: scoreCandidate(activity, plan) });
  }

  if (qualifiers.length === 0) {
    return { action: "logged_new" };
  }

  // Pick best: highest score → earliest plannedDate (lex asc) → lowest id (lex asc)
  const best = qualifiers.reduce((a, b) => {
    if (b.score !== a.score) return b.score > a.score ? b : a;
    if (a.plan.plannedDate !== b.plan.plannedDate) {
      return a.plan.plannedDate < b.plan.plannedDate ? a : b;
    }
    return a.plan.id < b.plan.id ? a : b;
  });

  return { action: "completed_plan", planId: best.plan.id, confidence: best.score };
}
