# Subtree Instructions — apps/mobile

> Agent-binding rules for this subtree. Extends root `CLAUDE.md`.
> Pair file: [`./README.md`](./README.md) — narrative, workflows, gotchas.

## Purpose

Expo Router mobile app — tab shell with WIRED + SHELL screens.

This subtree is responsible for:
- The React Native / Expo mobile application for the Logged platform
- The Expo Router file-based navigation (tab shell + root layout)
- All screen components and the shared `ComingSoon` SHELL placeholder

---

## Out of scope

This subtree does NOT own:
- Business logic and domain models (lives in `packages/core`)
- Backend / API (lives in `services/`)
- Database schema / migrations (lives in `supabase/`)

---

## Invariants (must not be broken)

### Navigation
- Every tab screen (`index`, `activities`, `plans`, `progress`, `settings`) must exist from day one — no missing route files
- SHELL screens render `<ComingSoon />`, never a blank screen or null
- The root layout (`app/_layout.tsx`) must always use `headerShown: false`

### Auth
- OAuth uses the `logged://` scheme via `expo-auth-session` (Plan 2 implementation)
- The `scheme` in `app.json` must remain `"logged"`

### Screens
- WIRED screens (Home, Activities, Plans, Settings) get real data wired in Plan 5 — do NOT prematurely add data-fetching code
- SHELL screens (`progress.tsx` at minimum) keep `<ComingSoon />` until their plan phase

### Testing
- The `ComingSoon` component has a test that must always pass
- Never delete or weaken the `toBeOnTheScreen()` assertions to make tests pass

---

## Component relationships

- `ComingSoon` ([`components/ComingSoon.tsx`](./components/ComingSoon.tsx))
  - Used by: all 5 tab screens (SHELL phase)
  - Replaced by: real screen components in Plan 5

- `app/_layout.tsx` — root Stack layout, headerShown=false
- `app/(tabs)/_layout.tsx` — Tabs layout with 5 named tabs
- `app/(tabs)/index.tsx` — Home tab (SHELL)
- `app/(tabs)/activities.tsx` — Activities tab (SHELL)
- `app/(tabs)/plans.tsx` — Plans tab (SHELL)
- `app/(tabs)/progress.tsx` — Progress tab (SHELL)
- `app/(tabs)/settings.tsx` — Settings tab (SHELL)

---

## Entry points

- Primary navigation entry: [`app/_layout.tsx`](./app/_layout.tsx)
- Tab shell: [`app/(tabs)/_layout.tsx`](./app/(tabs)/_layout.tsx)
- Shared placeholder: [`components/ComingSoon.tsx`](./components/ComingSoon.tsx)

---

## Library / tooling rules

- Use:
  - `expo-router` for all routing (file-based, no `react-navigation` directly)
  - `@testing-library/react-native` for component tests
  - `jest-expo` as the Jest preset
  - `babel-preset-expo` (via `babel.config.js`) — required for Flow type stripping in RN packages
- Do not use:
  - `react-navigation` APIs directly (always go through `expo-router`)
  - Blank screens / null returns — always render `<ComingSoon />` until real data is wired
  - `vitest` (this package uses Jest/jest-expo, not vitest)

---

## Key patterns to follow

- New SHELL tab screen: import `ComingSoon`, return `<ComingSoon feature="<Name>" />`
- New WIRED screen: add real component, keep `<ComingSoon />` for sub-sections not yet implemented

---

## Anti-patterns to avoid

- Do NOT add `node_modules` to version control
- Do NOT remove `babel.config.js` — it is required to transform Flow types in React Native packages under pnpm
- Do NOT change `transformIgnorePatterns` in `jest.config.js` without testing both hoisted and `.pnpm` store paths
- Do NOT bypass `strict: true` in tsconfig

---

## Commands

- Tests: `pnpm --filter @logged/mobile test`
- Typecheck: `pnpm --filter @logged/mobile typecheck`
- Start dev server: `pnpm --filter @logged/mobile start`

Broader workflows live in [`./README.md`](./README.md).
