# Architecture

> The living record of how the system is designed — *what exists now*, not aspirational design.
> Subtree rules live in [`./CLAUDE.md`](./CLAUDE.md). Durable decisions live in [`./decisions/`](./decisions/).

## Contents

| Document | Owns |
|----------|------|
| [`overview.md`](./overview.md) | High-level design, request/data flows, layer boundaries |
| [`data-model.md`](./data-model.md) | Data model / schema reference (schema is source of truth) |
| [`infrastructure.md`](./infrastructure.md) | Infrastructure topology (IaC is source of truth) |
| [`decisions/`](./decisions/) | Architecture Decision Records |

## Maintenance

- Keep these docs in sync with the code/IaC they describe; the code is source of truth, the doc explains it.
- When a significant architectural decision is made, create an ADR in `decisions/`.
