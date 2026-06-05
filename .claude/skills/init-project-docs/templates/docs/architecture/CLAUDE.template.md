# Subtree Instructions — docs/architecture/

> These rules apply only within `docs/architecture/`. They extend `docs/CLAUDE.md`.
> Pair file: [`./README.md`](./README.md).

## Purpose

This folder owns the living record of how the system is designed. Docs here describe *what exists now*, not what might exist in the future.

---

## Invariants (must not be broken)

- `overview.md` describes the current system. Update it when structure changes, not as aspirational design.
- `data-model.md` must stay in sync with the schema source of truth; the schema is authoritative, this doc explains it.
- `infrastructure.md` must stay in sync with the IaC source of truth; the IaC is authoritative, this doc explains it.
- ADRs in `decisions/` are append-only for decisions. See [`decisions/CLAUDE.md`](./decisions/CLAUDE.md).

---

## Key patterns to follow

- When the schema changes, update `data-model.md`.
- When infrastructure config changes, update `infrastructure.md`.
- When a significant architectural decision is made, create an ADR in `decisions/`.

---

## Anti-patterns to avoid

- Do not put feature plans or roadmap items here.
- Do not describe how something *should* work — only how it *does* work.
- Do not describe internal service implementation details (those belong in the service's own `README.md`).
