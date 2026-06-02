# apps/mobile

> Narrative and human-facing context for the Logged mobile app.
> Pair file: [`./CLAUDE.md`](./CLAUDE.md) — agent-binding rules, invariants, source-of-truth.

## Purpose

The `@logged/mobile` package is the React Native / Expo application for the Logged fitness tracking platform. It provides a native mobile experience on iOS and Android via the Expo managed workflow.

This package is not responsible for:
- Business logic / domain models (`packages/core`)
- Backend API (`services/`)
- Database schema (`supabase/`)

---

## Where this fits

Parent context:
- [Root README](../../README.md)

---

## Tab structure

The app uses Expo Router file-based routing with a bottom tab navigator. All five tabs exist from day one:

| Tab | File | Status |
|-----|------|--------|
| Home | `app/(tabs)/index.tsx` | SHELL (Plan 5 wires real data) |
| Activities | `app/(tabs)/activities.tsx` | SHELL (Plan 5) |
| Plans | `app/(tabs)/plans.tsx` | SHELL (Plan 5) |
| Progress | `app/(tabs)/progress.tsx` | SHELL |
| Settings | `app/(tabs)/settings.tsx` | SHELL (Plan 5) |

SHELL screens render `<ComingSoon feature="<Name>" />` — they are never blank.

---

## Important files and folders

```txt
apps/mobile/
├── app/
│   ├── _layout.tsx          # Root Stack layout (headerShown: false)
│   └── (tabs)/
│       ├── _layout.tsx      # Bottom Tabs layout
│       ├── index.tsx        # Home tab
│       ├── activities.tsx   # Activities tab
│       ├── plans.tsx        # Plans tab
│       ├── progress.tsx     # Progress tab
│       └── settings.tsx     # Settings tab
├── components/
│   ├── ComingSoon.tsx       # Shared SHELL placeholder component
│   └── ComingSoon.test.tsx  # Component test (jest-expo + @testing-library/react-native)
├── app.json                 # Expo app config (slug: logged, scheme: logged)
├── babel.config.js          # Expo babel config (required for Flow type stripping)
├── jest.config.js           # Jest config with pnpm-compatible transformIgnorePatterns
├── jest-setup.ts            # @testing-library/react-native setup
├── package.json
└── tsconfig.json            # Extends expo/tsconfig.base + strict
```

---

## Common workflows

```bash
# Start the Expo dev server (Expo Go or simulator)
pnpm --filter @logged/mobile start

# Run the test suite
pnpm --filter @logged/mobile test

# Type-check
pnpm --filter @logged/mobile typecheck
```

---

## Gotchas

- **pnpm + Expo/RN:** React Native packages contain Flow types and require Babel transformation. The root `.npmrc` uses `node-linker=hoisted` and `babel.config.js` uses `babel-preset-expo` to handle this. The `transformIgnorePatterns` in `jest.config.js` uses a two-part regex to cover both hoisted `node_modules/` paths and pnpm virtual store (`.pnpm/<pkg@ver>/node_modules/`) paths.

- **babel.config.js is required:** Do not remove it. Without it, Jest cannot transform Flow-typed React Native packages (e.g. `@react-native/js-polyfills/error-guard.js`).

- **OAuth scheme:** The `logged://` deep-link scheme (configured in `app.json`) is reserved for `expo-auth-session` OAuth callbacks in Plan 2. Do not change the scheme.

- **SHELL vs WIRED:** SHELL screens are intentional placeholders. Do not add data-fetching or real UI to SHELL screens — that work is scoped to later plan phases.

---

## Documentation maintenance

Update this README when changes affect:
- the tab structure or routing
- the build / test / typecheck workflow
- pnpm / Expo / RN version gotchas
- the SHELL → WIRED screen promotion schedule
