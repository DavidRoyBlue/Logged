# Documentation

> Index of system-level documentation. Subtree rules live in [`./CLAUDE.md`](./CLAUDE.md).
> `docs/` is the single source of truth for system-level documentation — not a scratchpad, not a mirror of code comments.

## Contents

| Document | Owns |
|----------|------|
| [`product.md`](./product.md) | Product vision and what the product does |
| [`roadmap.md`](./roadmap.md) | Phase-by-phase delivery; what's built / what's next |
| [`stack.md`](./stack.md) | Technology choices, each linked to its deciding ADR |
| [`architecture/overview.md`](./architecture/overview.md) | High-level system design |
| [`architecture/data-model.md`](./architecture/data-model.md) | Data model / schema reference |
| [`architecture/infrastructure.md`](./architecture/infrastructure.md) | Infrastructure topology |
| [`architecture/decisions/`](./architecture/decisions/) | Architecture Decision Records (ADRs) |

## Maintenance

- New top-level documents need an entry in this table.
- Cross-link between docs rather than duplicating content.
- If a doc contradicts current code, fix or delete the stale part in the same change.
