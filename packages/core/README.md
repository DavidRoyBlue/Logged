# @logged/core

> Narrative and human-facing context for this package.
> Pair file: [`./CLAUDE.md`](./CLAUDE.md) — agent-binding rules, invariants, source-of-truth.

## Purpose

`@logged/core` is the shared domain logic library for the Logged monorepo. It owns the canonical TypeScript types and pure helper functions that the Cloud Run workers (Ingestion in Plan 3, Sync loop in Plan 4) depend on.

This package is responsible for:
- Defining `NormalizedActivity` — the single shape that the ingestion worker emits and the sync worker consumes
- Defining `PlannedSession`, `MatchResult`, and `OutboundDestination` — the contracts for plan matching and outbound adapters
- Providing `computePaceSPerKm(distanceM, movingTimeS)` — pure pace calculation
- Providing `withinWindow(plannedDate, activityStartIso, hours)` — pure time-window check
- Exporting throwing stubs for `normalize()` and `matcher()` as placeholder contracts until Plans 3 and 4 are implemented

This package is not responsible for:
- Any database access, HTTP requests, or file I/O
- Full implementations of `normalize()` or `matcher()` (those live in the Cloud Run worker packages)
- Any Strava API interaction

---

## Where this fits

Parent context:
- [Parent README](../../README.md)

---

## Boundaries

Code in this package may:
- Define types, interfaces, and pure functions
- Import from other packages in this monorepo that are also pure (no I/O)
- Use standard TypeScript/JS built-ins (Date, Math, etc.)

Code in this package must not:
- Import `supabase`, `fetch`, `axios`, `fs`, or any I/O module
- Contain any `async` functions that perform I/O (the `OutboundDestination` interface defines an async contract, but is not implemented here)
- Implement `normalize()` or `matcher()` beyond their throwing stubs

Source of truth:
- All canonical domain types: [`src/types.ts`](./src/types.ts)

---

## Important files and folders

```txt
packages/core/
├── src/
│   ├── index.ts          # Public surface — re-exports everything
│   ├── types.ts          # Canonical domain types
│   ├── normalize.ts      # computePaceSPerKm helper + normalize() stub
│   ├── normalize.test.ts # Tests for computePaceSPerKm
│   ├── matcher.ts        # withinWindow helper + matcher() stub
│   └── matcher.test.ts   # Tests for withinWindow
├── package.json
├── tsconfig.json
├── CLAUDE.md
└── README.md
```

---

## Common workflows

```bash
# Run unit tests
pnpm --filter @logged/core test

# Type-check without emitting
pnpm --filter @logged/core typecheck
```

---

## Gotchas

- `normalize()` and `matcher()` are intentional throwing stubs. Calling them at runtime will throw. This is by design — their real implementations ship in Plans 3 and 4.
- The package uses `"type": "module"` and `"main": "src/index.ts"`. Consumers reference the TypeScript source directly (no build step needed within the monorepo).
- All exported names are load-bearing for Plans 3 and 4. Do not rename without coordinating across those packages.
