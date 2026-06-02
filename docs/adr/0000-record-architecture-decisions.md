# ADR 0000: Record Architecture Decisions

- Status: Accepted
- Date: 2026-06-02

## Context

As Logged is built by a solo developer across multiple planned layers, technical decisions will accumulate. Without a lightweight record-keeping mechanism, the reasoning behind choices becomes opaque over time — especially when an AI agent is involved in implementation. It becomes difficult to challenge or revisit decisions, and easy to accidentally reverse them without recognising the tradeoffs.

## Decision

We will record significant architecture decisions as Architecture Decision Records (ADRs) in `docs/adr/`, using a lightweight MADR-style format with Context / Decision / Consequences sections.

ADRs are numbered sequentially, named with a descriptive kebab-case slug, and follow a status lifecycle of **Proposed → Accepted → Superseded**. Past ADRs are never deleted or rewritten; a new ADR supersedes an old one when a decision is reversed.

New ADRs are authored using the `write-adr` skill.

## Consequences

- Durable decisions are visible to both human developers and AI agents, reducing accidental reversals.
- The `docs/adr/` directory becomes a mandatory stop when reading docs before cross-boundary changes.
- There is a small ongoing cost to author ADRs for significant decisions, which is offset by reduced confusion and easier onboarding.
