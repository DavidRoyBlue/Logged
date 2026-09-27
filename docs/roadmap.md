# Roadmap

> Source of truth for what's in flight, what's next, and what just landed. Every PR that changes what happens next updates this file (see `AGENTS.md`).

## Now

- **#11 — Add `docs/roadmap.md` and `docs/decisions.md`** (this change): gives the project manager a source of truth on repo/PR activity instead of re-deriving it each run.

## Next

Layer 0 (the end-to-end vertical slice — Strava sign-in → ingest → plan-push → match → mobile shell) has its component logic built and tested, but the pieces are not wired together. Per `docs/PROJECT_STATE.md` (2026-06-05 snapshot, still the latest full audit), in priority order:

1. **Assemble the worker.** `services/worker/src/index.ts` exposes only `GET /healthz`; the ingest/sync/backfill/reconcile/planpush handlers are exercised only by tests, not reachable via any HTTP route or drain loop. Nothing can run end-to-end until this is wired.
2. **Real external clients.** `HttpStravaClient` is defined but never instantiated; Google Calendar/Notion adapters have no production `CalendarClient`/`NotionClient` (no `googleapis`/`@notionhq` dependency installed). All tests run against fakes only.
3. **Fix the mobile `plans` query bug.** `apps/mobile/lib/data.ts:56` queries `.from("plans")`, but the table is `planned_sessions` — the Plans screen will fail at runtime. Mocked tests don't catch it.
4. **Add `.env.example`** covering every var documented in root `AGENTS.md`.
5. **Register OAuth apps** (Strava/Google/Notion) and run one live round-trip per provider; resolve the `session-exchange` mint-approach question (`auth.admin.generateLink` vs `createSession`).
6. **Deploy path.** No Cloud Run config, no Cloud Scheduler, no remote Supabase project, no production worker entrypoint (Dockerfile still runs `dev`/tsx).
7. **Reliability & observability.** No retry cap/dead-letter on queue jobs (`retry_count` column unused); no structured logging, metrics, or error reporting anywhere.

No open GitHub issues currently track items 1–7 above — they exist only in `docs/PROJECT_STATE.md`'s "Recommended Next Actions." File issues before starting any of them.

## Done (recent)

- **#10 — ci: make main green** (merged 2026-09-24, closes #3/#5/#6/#7): fixed the Node-20-without-native-`WebSocket` crash in `services/worker` and `supabase/tests/helpers.ts` by wiring a `ws` transport, and started local Supabase in the `build-test` CI job so worker integration tests can connect.
- **#2 — Drop the dead code-review-graph remnants** (merged 2026-09-24, closes #1): removed hooks/skills referencing a `code-review-graph` binary that was never on PATH and had no `.mcp.json`; repo is also below the tool's own usefulness threshold (~80 TS files).

## Open questions

Carried from `docs/PROJECT_STATE.md`:

- **Worker trigger model** — pg_cron `net.http_post` to Cloud Run, Cloud Scheduler, or a long-running pull loop? Undecided in code.
- **Session minting** — is `auth.admin.generateLink(magiclink)` the right way to mint the OAuth handoff session, or is `createSession` needed?
- **Matcher tolerance** — docs say ±20% distance window, code (`packages/core`) implements ±50%. Which is correct?
- **Secret management** — Supabase Vault vs. GCP Secret Manager split for production: undecided.
- **Retry/dead-letter policy** — what retry cap and failure handling for queue jobs? `retry_count` column exists, unused.
- **Mobile distribution & push** — EAS/store strategy, and the push-notification stack (`expo-notifications` isn't even a dependency yet) are unplanned.
