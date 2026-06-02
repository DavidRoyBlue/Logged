# ADR 0001: Mobile Framework — Expo/React Native

- Status: Accepted
- Date: 2026-06-02

## Context

Logged is a daily-use running app. Users will open it to check their training plan, review a just-completed run match, and eventually receive AI coaching feedback. A web app or PWA would sacrifice the native feel (animations, haptics, background sync, push notifications) that daily-use fitness apps require. The build needs to be sustainable for a solo developer, so a single codebase targeting both iOS and Android is strongly preferred.

## Decision

Use **Expo / React Native** with **Expo Router** for the mobile client.

Expo is chosen over bare React Native for its managed workflow, simplified native module handling, and EAS Build/Submit pipeline. Expo Router provides file-system-based navigation consistent with modern web conventions, reducing cognitive overhead when switching between mobile and web mental models.

## Consequences

- A single TypeScript codebase targets both iOS and Android.
- Native feel (animations, haptics) and future push notifications are achievable without ejecting.
- Expo's managed workflow constrains which native modules can be used without a custom dev client, but this is acceptable for Layer 0.
- Test tooling is Jest + @testing-library/react-native (the Expo default) rather than Vitest.
- EAS Build/Submit handles CI distribution without maintaining a macOS build machine.
