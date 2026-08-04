# Subtree Instructions — packages/core

> Agent-binding rules for this subtree. Extends root `AGENTS.md`.
> Pair file: [`./README.md`](./README.md) — narrative, workflows, gotchas.

## Purpose

Pure shared domain logic: types, normalize helper, and matcher helper. Zero I/O.

This subtree is responsible for:
- Defining the canonical domain types (`NormalizedActivity`, `PlannedSession`, `MatchResult`, `OutboundDestination`) consumed across the monorepo
- Providing `computePaceSPerKm` — pure pace calculation helper
- Providing `withinWindow` — pure time-window check helper
- Exporting stubs for `normalize()` and `matcher()` whose real implementations land in Plan 3 (Ingestion) and Plan 4 (Sync loop) respectively

---

## Invariants (must not be broken)

### Side-effect freedom
- NEVER import `supabase`, any network client, `fs`, or any I/O module in this package. It must stay completely side-effect-free so it remains exhaustively unit-testable. Cloud Run workers import this package; any I/O import would pollute them.

### Stub preservation
- `normalize()` and `matcher()` are intentional throwing stubs. Do NOT implement them here — their real logic belongs in the Cloud Run workers (Plans 3 and 4). Keep them as stubs that throw `Error`.

### Name stability
- All exported names are load-bearing. Later plans depend on exact names. Do not rename exports without a coordinated change across Plans 3 and 4.

---

## Source of truth

- Domain types (`NormalizedActivity`, `PlannedSession`, `MatchResult`, `OutboundDestination`, `ZoneDistribution`, `ActivityType`): [`src/types.ts`](./src/types.ts)
- Pace calculation helper (`computePaceSPerKm`): [`src/normalize.ts`](./src/normalize.ts)
- Time-window helper (`withinWindow`): [`src/matcher.ts`](./src/matcher.ts)
- Public surface: [`src/index.ts`](./src/index.ts)

---

## Entry points

- Primary entry: [`src/index.ts`](./src/index.ts) — re-exports everything
- Types only: [`src/types.ts`](./src/types.ts)
- Normalize helpers: [`src/normalize.ts`](./src/normalize.ts)
- Matcher helpers: [`src/matcher.ts`](./src/matcher.ts)

---

## Library / tooling rules

- Use:
  - Vitest for all tests
  - TypeScript strict mode (inherited from `tsconfig.base.json`)
- Do not use:
  - Any runtime with I/O: `supabase`, `fetch`, `axios`, `fs`, `node:fs`, `node:net`, etc.
  - Any test framework other than Vitest

---

## Commands

Commands the agent must run as part of its work in this subtree.

- Tests: `pnpm --filter @logged/core test`
- Typecheck: `pnpm --filter @logged/core typecheck`
- Lint: `pnpm --filter @logged/core lint`
