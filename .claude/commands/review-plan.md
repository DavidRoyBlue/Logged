---
description: Review a plan using cold + parallel review when a spec exists, or cold-context-only review when no spec exists
argument-hint: <plan-path>
---

Run the plan-review pipeline against $1.

Step 1 — Determine the spec path:
- Replace the **first** occurrence of `/plans/` in $1 with `/specs/` to get the candidate spec path.
- If $1 starts with `plans/` (no leading slash), the spec path is `specs/` followed by the rest of $1.

Step 2 — Branch on whether the spec file exists:

**If the spec file exists:**
1. Invoke the `parallel-planner` subagent with:
   - Spec: <inferred-spec-path>
   - Output path: $1.parallel.md
2. After it returns, invoke the `plan-differ` subagent with:
   - ORIGINAL: $1
   - PARALLEL: $1.parallel.md
   - Output: $1.diff.md
3. Print the diff report and STOP. Do not act on divergences. Wait for me.

**If the spec file does NOT exist:**
1. State clearly that no spec was found at the inferred path, so this will be a cold-context-only review (weaker than the full pipeline — no independent plan to compare against).
2. Invoke the `cold-reviewer` subagent with:
   - Plan: $1
   - Output: $1.review.md
3. Print the review report and STOP. Wait for me.

In both branches: do not modify the original plan, and do not start implementing anything.
