---
name: write-adr
description: Use when making or recording a durable architectural or technical decision — choosing a framework, database, queue, auth strategy, hosting platform, or any choice that is expensive to reverse and that someone will question in 6+ months. Triggers include "should we use X or Y", "write an ADR", "record this decision", and picking between competing tools or libraries.
---

# Write ADR

## Overview

Records a durable decision as an Architecture Decision Record: a researched, first-principles comparison of ≥3 options that captures *what* was decided and *why*. Core principle: **the current/in-use tool gets the same critical eye as the alternatives** — write the ADR as if the choice has not yet been made. If first-principles analysis favors a different option than the one you're keeping, that's an expected outcome — raise the 🚩 reconsideration flag, don't bury it.

## When to use (the gate)

Write an ADR when the decision:
- constrains future technical choices, **or**
- is expensive to reverse, **or**
- would make a reasonable person ask "why did we do this?" in 6+ months.

## When NOT to use

- Reversible choices (library version bumps, internal refactors).
- Implementation details (those go in code or folder READMEs).
- Style or naming conventions (CLAUDE.md or README).
- A single-tool justification already covered by a broader decision-area ADR.

## Workflow

1. **Locate the ADR directory.** Prefer `docs/architecture/decisions/`; fall back to `docs/architecture/ADRs/` or `docs/decisions/` if that's what the repo uses. No ADR dir yet? Run the `init-project-docs` skill first.
2. **Find the next number.** Read the directory's `README.md` index; numbers are global, zero-padded to 3 digits, never reused. Copy `references/adr-template.md` → `ADR-NNN-<decision-area-slug>.md`.
3. **Research — mandatory, not optional.** Before drafting:
   - Read the repo's actual usage of the relevant tools (wrappers, where the abstraction leaks).
   - Read current vendor docs (capabilities, pricing, limits, deprecations) — use the context7 MCP for library docs where available.
   - Web-search current-year comparisons, benchmarks, migration stories, post-mortems. Old comparisons aren't authoritative about current tools.
   - Surface at least one option you wouldn't have included from habit.
   - No unsourced numbers or claims. Label uncertainty as such.
4. **Fill all 8 sections** (the template enforces order): Status (`Proposed` default) + `YYYY-MM-DD` date; Context (with the stack-situation paragraph); Non-goals; Decision Drivers (each explains *why in our context*); Options Considered (≥3, concrete non-slogan Pros/Cons, current tool included); Decision (one sentence, active voice); Rationale (name what's sacrificed); Consequences (Positive / Negative / Follow-up decisions).
5. **First-principles + 🚩.** If analysis concludes a different option fits better but you're keeping the current one (legacy/inertia/cost), set Status to `🚩 Accepted with reconsideration flag` and add the flag block in Rationale: better option / why better / why staying / specific migration trigger.
6. **Wire it in.** Update the directory `README.md` index (and the 🚩 list if flagged); update `docs/stack.md` if the decision touches a listed tool; add a one-line "Key Decisions" link in the nearest subsystem `README.md`/`CLAUDE.md`. Link to the ADR — never duplicate its content.
7. **Respect append-only.** Never renumber, delete, or rewrite the Decision/Rationale of an accepted ADR. A changed decision = a new ADR that supersedes the old one (move the old file to `_superseded/`, link both ways).
8. If an ADR CI workflow is present, note the PR will receive an automated outsider critique.

## Common mistakes

- Blindly templating — filling sections with generic bullets. A blindly-templated ADR fails the bar. Length follows depth.
- Treating the in-use tool as the default instead of one candidate → defeats first-principles analysis.
- Sales-pitch Pros ("Great DX") → state the concrete capability ("lets us avoid hand-rolling ret/backoff").
- Editing an accepted decision in place instead of superseding it.
- Skipping the research step and writing from memory → unsourced claims.

## References

- `references/adr-template.md` — the 8-section template to copy.
- `references/governance.md` — full rules: the bar, status values, numbering, append-only, 🚩 flag, and what to update after acceptance. Read this before your first ADR in a repo.
