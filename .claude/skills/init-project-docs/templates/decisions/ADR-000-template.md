# ADR-NNN: <Decision area title>

## Status

Proposed | Accepted | 🚩 Accepted with reconsideration flag | Superseded by ADR-NNN
Date: YYYY-MM-DD

<!--
If flagged, add a single one-line summary of the flag here, e.g.:
🚩 Reconsideration flag: <better option> would fit better because <reason>; staying with <current> because <reason>; migration trigger: <event>.
-->

## Context

What architectural problem are we solving and why now? Include the **stack situation**:
where this sits relative to other ADRs, and what it has to be compatible with. Enough
that a reader two years from now, with no memory of the moment, understands why a
choice had to be made.

## Non-goals

This ADR does not decide:
- <related but separate decision — point to the ADR that owns it>
- <implementation detail handled elsewhere>
- <out-of-scope concern that a reader might wrongly expect to be answered here>

## Decision Drivers

The criteria that matter for choosing among options, ordered by importance.
Each driver names *why* it matters in our context, not in general.

- <Driver> — <why it matters here>
- <Driver> — <why it matters here>

## Options Considered

At least 3 options. Each gets neutral, equal treatment. No favoritism here —
the favoring happens in Decision/Rationale. Pros and Cons must be concrete and
verifiable, not slogans. The current in-use tool (if any) gets the same critical
eye as the rejected ones.

### Option A: <Name>
**What it is:** 1 sentence.

**Pros**
- <real, specific strength>

**Cons**
- <real, specific weakness>

### Option B: <Name>
**What it is:** 1 sentence.

**Pros**
- ...

**Cons**
- ...

### Option C: <Name>
**What it is:** 1 sentence.

**Pros**
- ...

**Cons**
- ...

## Decision

**We chose: <Option>.**

One sentence. Active voice. No hedging.

## Rationale

Why this option won given the drivers and our context. Name what we are sacrificing
by picking it — an honest rationale acknowledges the loss.

If first-principles analysis points to a different option as a better technical fit
and we picked the current one for legacy / inertia / cost reasons, raise the
🚩 reconsideration flag here in addition to Status:

> 🚩 **Reconsideration flag:** <better option> would fit better because <reason>.
> Staying with <current> because <reason>. Migration trigger: <specific event/condition>.

## Consequences

### Positive
- ...

### Negative
- ...

### Follow-up decisions
- <decisions this choice forces us to make next, possibly in other ADRs>
- <future events that should make us revisit this ADR>
