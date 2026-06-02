# Architecture Decision Records

This directory captures durable architecture decisions for the Logged project using a lightweight [MADR](https://adr.github.io/madr/)-style format.

## Process

1. When a significant technical decision is made, create a new ADR file here.
2. Use the `write-adr` skill (or copy the format from an existing ADR).
3. Number sequentially (`NNNN`), using a descriptive kebab-case slug.
4. Status lifecycle: **Proposed → Accepted → Superseded**.
5. If a decision is reversed, mark the old ADR "Superseded by ADR XXXX" and create the new one.

ADRs are append-only — never delete or rewrite a past decision. Amend with a new ADR that supersedes it.

---

## Index

| # | Title | Status |
|---|-------|--------|
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0001](0001-mobile-framework-expo-react-native.md) | Mobile framework: Expo/React Native | Accepted |
| [0002](0002-backend-platform-supabase.md) | Backend platform: Supabase | Accepted |
| [0003](0003-auth-model-unified-identity.md) | Auth model: unified identity with connections | Accepted |
| [0004](0004-async-processing-pgmq-cloud-run.md) | Async processing: pgmq + Cloud Run workers | Accepted |
| [0005](0005-custom-oauth-security-state-pkce-handoff.md) | Custom OAuth security: state + PKCE + single-use handoff | Accepted |
| [0006](0006-mobile-oauth-redirect-expo-auth-session.md) | Mobile OAuth redirect: expo-auth-session + custom scheme | Accepted |
| [0007](0007-outbound-abstraction-destination-interface.md) | Outbound abstraction: OutboundDestination interface | Accepted |
| [0008](0008-plan-source-of-truth-app-owned.md) | Plan source of truth: app-owned, push-only | Accepted |
| [0009](0009-backfill-strategy-free-vs-pro-tier.md) | Backfill strategy: free 90-day vs pro full history | Accepted |
| [0010](0010-stats-capture-at-ingest.md) | Stats data capture at ingest | Accepted |
| [0011](0011-monorepo-pnpm-packages-core.md) | Monorepo: pnpm workspaces + packages/core isolation | Accepted |
| [0012](0012-test-tooling-vitest-jest-deno.md) | Test tooling: Vitest + Jest + Deno test | Accepted |
| [0013](0013-worker-http-framework-hono.md) | Worker HTTP framework: Hono on Cloud Run | Accepted |
