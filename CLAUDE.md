# Claude Project Instructions — Logged

> Root agent-binding rules for this repository. Nested `CLAUDE.md` files extend and narrow these within their subtree.
> Pair file: [`./README.md`](./README.md) — product/repo overview for humans.

---

## Project overview

Logged is a mobile running app that auto-syncs Strava activities, manages app-owned training plans pushed to Google Calendar and Notion, and matches completed runs to planned sessions. The backend is a Supabase + Cloud Run hybrid: Supabase handles auth, Postgres, Edge Functions, Realtime, and pgmq-based queueing; Cloud Run workers handle ingest, sync, plan-push, and (in future layers) AI coaching; the mobile client is an Expo/React Native app with native feel and push notification support.

| Layer | Package | Role |
|-------|---------|------|
| Shared domain logic | `packages/core` | Pure TypeScript — matchers, normalizers, types. No I/O. |
| Background workers | `services/worker` | Cloud Run (Hono, Node 20+) — ingest, sync, backfill, plan-push |
| Mobile client | `apps/mobile` | Expo/React Native (Expo Router) |
| DB + edge | `supabase/` | Postgres migrations, RLS policies, Edge Functions, pgmq queues |
| Docs | `docs/` | Architecture docs, ADRs, specs, plans |

---

## Tech stack

- **Language**: TypeScript throughout
- **Package manager**: pnpm workspaces (pnpm 10.15 / Node 24)
- **Database / Auth / Realtime**: Supabase (Postgres, Auth, Edge Functions, Realtime, pgmq)
- **Workers**: Cloud Run — Hono on Node 20+
- **Mobile**: Expo / React Native with Expo Router
- **Testing**:
  - `packages/core` + `services/worker` + Supabase RLS integration tests → Vitest
  - `apps/mobile` → Jest + @testing-library/react-native (Expo default)
  - Edge Functions → Deno test

---

## Commands

```bash
pnpm install              # install all workspace deps

pnpm exec supabase start  # start local Supabase stack (Docker required)
pnpm exec supabase stop   # stop local Supabase stack

pnpm build                # build all packages
pnpm typecheck            # type-check all packages
pnpm lint                 # lint all packages
pnpm lint --fix           # auto-fix linting issues
pnpm test                 # run all tests (Vitest + Jest)
pnpm test --filter core   # run tests for a specific package

pnpm exec supabase db push        # apply pending DB migrations
pnpm exec supabase db diff        # generate migration from schema diff
pnpm exec supabase studio         # open Supabase Studio UI
pnpm exec supabase db reset       # DESTRUCTIVE: wipe and recreate local DB
```

---

## Environment

Copy `.env.example` → `.env.local`. Minimum required to boot workers:

| Var | Used by | Note |
|-----|---------|------|
| `SUPABASE_URL` | workers, mobile | Local: `http://127.0.0.1:54321` |
| `SUPABASE_ANON_KEY` | mobile | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | workers | Server-side only — never expose to client |
| `DATABASE_URL` | workers (direct) | Supavisor pooler port 6543 (transaction mode) for Cloud Run |
| `STRAVA_CLIENT_ID` | edge functions, workers | Strava OAuth app |
| `STRAVA_CLIENT_SECRET` | edge functions | Server-side only |
| `GOOGLE_CLIENT_ID` | edge functions | Google OAuth app |
| `GOOGLE_CLIENT_SECRET` | edge functions | Server-side only |

---

## Architecture pointers

- **Design spec**: [`docs/superpowers/specs/2026-06-02-logged-layer0-design.md`](docs/superpowers/specs/2026-06-02-logged-layer0-design.md)
- **ADRs**: [`docs/adr/`](docs/adr/) — all durable architecture decisions

---

## Documentation convention

Every package/major directory MUST contain a paired `CLAUDE.md` + `README.md`:
- `CLAUDE.md` — agent-binding rules, invariants, source-of-truth (from `CLAUDE.nested.template.md`).
- `README.md` — narrative, workflows, gotchas (from `README.template.md`).
When you add a new package, copy both templates and fill the applicable sections; delete empty ones.
Architecture decisions are recorded in `docs/adr/` via the write-adr skill.

---

## Core engineering values

Every code change must respect these.

1. **Test what you change.** Add or update focused tests for new or changed behavior. If a test isn't practical, explain why and describe how you verified it manually.
2. **Single source of truth.** Don't duplicate facts, config, schemas, business rules, or ownership info in code. Update the authoritative source; reference it from elsewhere.
3. **Modular design.** Isolated responsibilities, clear interfaces, small modules. Don't couple unrelated concerns to ship faster.
4. **Simplicity first.** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no configurability that wasn't asked for.
5. **Surgical changes.** Touch only what the task requires. No drive-by cleanup. Match existing style — exception: if it violates an invariant stated in a nested `CLAUDE.md`, the invariant wins.

---

## Before you code

State assumptions before implementing. If uncertain, ask:

- If multiple interpretations exist, name them — don't pick silently.
- If a simpler approach is available, say so and push back when warranted.
- If something is unclear, stop, name what's confusing, ask before proceeding.

For multi-step tasks, state a brief plan with verifiable checkpoints.

---

## Documentation-first rule

For non-trivial changes, read existing docs before editing:

1. Nearest relevant `README.md`
2. Parent `README.md` files, up to 2 levels up
3. Relevant ADRs in `docs/adr/` if the change touches a durable decision
4. The design spec at `docs/superpowers/specs/2026-06-02-logged-layer0-design.md` for cross-boundary decisions

Do not guess project conventions when documentation exists.

---

## Nested CLAUDE.md

Subtree-specific behavior rules belong in nested `CLAUDE.md` files:

- `packages/<name>/CLAUDE.md`
- `services/<name>/CLAUDE.md`
- `apps/<name>/CLAUDE.md`
- `supabase/CLAUDE.md`

Nested rules extend this root file and narrow it within their subtree.

---

## Where to document

- Local implementation detail → nearest folder `README.md`
- Service/package responsibility → service/package `README.md`
- Cross-boundary contract → README of the lowest common ancestor folder
- Durable decision/tradeoff → ADR in `docs/adr/`
- Verification commands (tests, typecheck, lint) → nearest `CLAUDE.md`
- Broader workflows → nearest README, plus root README if globally relevant
- Non-obvious code behavior → code comment

---

## Compounding rule

After meaningful changes, ask: "Did this change teach the codebase something future agents or developers need to know?" If yes, update the closest relevant doc.

---

## Pruning rule

If documentation contradicts current code, fix or delete the stale documentation in the same change. Stale docs are worse than missing docs.

---

## Final response expectation

When completing a task, mention:
1. What code changed
2. What tests were added or updated (or why none were needed)
3. What docs were read
4. Whether docs were updated, and if not, why
