# ADR 0012: Test Tooling — Vitest + Jest + Deno Test

- Status: Accepted
- Date: 2026-06-02

## Context

Logged runs TypeScript in three distinct runtimes: Node 20+ (Cloud Run workers), Expo/React Native (mobile), and Deno (Edge Functions). Each runtime has its own module resolution, globals, and testing conventions. Using a single test framework across all three would require significant shim/polyfill work and could mask real runtime behaviour differences.

## Decision

Match each package's test toolchain to its runtime:

- **`packages/core`** and **`services/worker`** — **Vitest** (native ESM, fast, TypeScript-native, compatible with Node 20+)
- **Supabase RLS integration tests** — **Vitest** (run against the local Supabase stack via `supabase start`)
- **`apps/mobile`** — **Jest** + **@testing-library/react-native** (the Expo default; React Native's Metro bundler and JSX transform are wired for Jest)
- **`supabase/functions/`** (Edge Functions) — **Deno test** (native Deno toolchain; no Node shims required)

## Consequences

- Each package uses the test runner it was designed for, minimising configuration friction.
- CI must run three separate test commands (`pnpm test` for Vitest packages, `pnpm --filter mobile test` for Jest, `deno test` for Edge Functions).
- Developers switching between packages must be aware of which runner applies.
- RLS integration tests against the local Supabase stack require Docker and `supabase start` before running — this must be documented in `supabase/CLAUDE.md`.
