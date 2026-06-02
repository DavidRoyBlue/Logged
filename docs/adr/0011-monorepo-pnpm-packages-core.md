# ADR 0011: Monorepo — pnpm Workspaces + packages/core Isolation

- Status: Accepted
- Date: 2026-06-02

## Context

Logged spans three distinct runtime environments: Expo/React Native (mobile), Node 20+ (Cloud Run workers), and Deno (Edge Functions). Several pieces of logic — particularly the activity-to-plan matcher and the activity normalizer — are purely algorithmic with no I/O, and are needed in both the Cloud Run worker and potentially in the mobile client for local computation. If this logic lives inside a service package, it becomes hard to test in isolation and risks I/O coupling creeping in.

## Decision

Use **pnpm workspaces** as the monorepo tool (pnpm 10.15, Node >=20 (developed on Node 24)), with TypeScript throughout.

Isolate all pure domain logic in **`packages/core`**:

- Activity-to-plan matcher
- Activity normalizer (unit conversion, field mapping)
- Shared TypeScript types and Zod schemas
- Any other pure computation with no I/O dependency

`packages/core` must have zero I/O — no database calls, no HTTP calls, no file system access. Workers and mobile import from `packages/core` via the workspace reference `@logged/core`.

## Consequences

- `packages/core` is exhaustively unit-testable with Vitest, with no mocking of I/O.
- Domain logic bugs are caught before deployment to any runtime.
- The isolation boundary prevents I/O from leaking into domain logic over time — enforced by the "no I/O in core" invariant in `packages/core/CLAUDE.md`.
- Deno Edge Functions cannot directly import pnpm workspace packages; shared logic needed by Edge Functions must be vendored or duplicated into `supabase/functions/_shared/`.
- Adding a new shared domain concept requires placing it in `packages/core` first, not inline in a service.
