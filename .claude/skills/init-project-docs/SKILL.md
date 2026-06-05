---
name: init-project-docs
description: Use when starting a new repository or bootstrapping documentation infrastructure for an under-documented one — setting up the root CLAUDE.md and README, the layered docs/ tree, and ADR (architecture decision record) scaffolding. Triggers include "set up docs for this project", "scaffold CLAUDE.md", "new project setup", "add an ADR system".
---

# Init Project Docs

## Overview

Installs a layered documentation system into the current repo from bundled templates: a root `CLAUDE.md` (agent-binding rules) paired with a `README.md` (human-facing overview), a `docs/` tree (`product`/`roadmap`/`stack` + `architecture/`), and ADR infrastructure under `docs/architecture/decisions/`. Core principle: **README and CLAUDE.md split by audience and authority** — imperative rules live in CLAUDE.md, narrative in README, and each pair cross-links. Scaffold a focused skeleton, then fill it from the real repo; a short focused file beats a complete empty one.

## When to use

- Starting a brand-new repo ("set up the project", "scaffold docs/CLAUDE.md").
- Bringing structure to an existing repo with little/no documentation.
- Adding an ADR system to a project that records decisions ad hoc.

## When NOT to use

- A one-off edit to a single existing doc — open the relevant template under `templates/` and copy the section instead.
- The repo already has this structure — use `write-adr` for new decisions, and edit docs directly.

## Workflow

1. **Interview the repo first — never invent.** Read what already exists (package manifests, scripts, existing README, folder layout). Determine: monorepo vs single service; the real build/test/lint/migrate commands; env vars; the layer/package map. Ask the user only for what you can't infer.
2. **Scaffold the root pair.** Copy `templates/CLAUDE.ROOT.template.md` → `CLAUDE.md` and `templates/README.template.md` → `README.md`. Fill the project-overview table and commands from step 1. The root pair are siblings — point them at each other (`./README.md` / `./CLAUDE.md`). The README template's "Where this fits → Parent README" link is for nested folders only; **delete it at the repo root** (root has no parent). **Delete every other section with no real content** (the template says so itself).
3. **Scaffold `docs/`.** Create `docs/README.md`, `docs/CLAUDE.md`, and the `product`/`roadmap`/`stack` stubs from `templates/docs/*`. Add `docs/architecture/` (README, CLAUDE, and the overview/data-model/infrastructure stubs) only if the project will maintain them — offer, don't force.
4. **Scaffold ADR infrastructure.** Create `docs/architecture/decisions/` with `ADR-000-template.md`, `CLAUDE.md` (governance), and `README.md` (index) from `templates/decisions/*`.
5. **Optional nested pairs.** For each subtree the user names (a service, package, or app), drop a `CLAUDE.md` + `README.md` from `templates/CLAUDE.nested.template.md` and `templates/README.template.md`, then fill invariants/source-of-truth from step 1.
6. **Optional ADR CI.** If the repo uses GitHub Actions, offer `templates/ci/adr-review.yml` → `.github/workflows/adr-review.yml`. Tell the user it needs the `CLAUDE_CODE_OAUTH_TOKEN` repo secret and a current `--model` id.
7. **Hand off.** Tell the user: record the first decisions with the `write-adr` skill, and that the compounding/pruning rules are now in their root `CLAUDE.md`.

## What this creates

```
CLAUDE.md                 README.md
docs/
├── README.md  CLAUDE.md  product.md  roadmap.md  stack.md
└── architecture/
    ├── README.md  CLAUDE.md  overview.md  data-model.md  infrastructure.md
    └── decisions/
        ├── ADR-000-template.md   CLAUDE.md   README.md
.github/workflows/adr-review.yml   (optional)
<subtree>/CLAUDE.md  <subtree>/README.md   (optional, per subtree)
```

## Common mistakes

- Copying templates verbatim and leaving `<placeholder>` bullets → fill or delete them; placeholders are not documentation.
- Inventing commands or env vars not present in the repo → only document what's real (step 1).
- Scaffolding every optional file into a tiny project → skeleton bloat. Create only what will be maintained.
- Restating imperative rules in README → rules belong in CLAUDE.md; README links to them.

## References

- `templates/` — all bundled templates (root + nested CLAUDE.md, README, docs stubs, ADR template + governance, CI workflow).
- ADR authoring rules: `templates/decisions/CLAUDE.md`. For recording an actual decision, use the `write-adr` skill.
