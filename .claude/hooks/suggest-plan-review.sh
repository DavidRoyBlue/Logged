#!/usr/bin/env bash
# PostToolUse hook on Write. Surfaces a /review-plan suggestion when a plan file is written.
# Multi-location: matches plans/*.md anywhere in the tree, including
# docs/superpowers/plans/, .superpowers/plans/, .claude/plans/, and bare plans/.
# Spec detection is delegated to /review-plan itself — this hook just announces.

set -euo pipefail

event_json="$(cat)"

file_path="$(jq -r '.tool_input.file_path // empty' <<<"$event_json")"
[[ -z "$file_path" ]] && exit 0

# Match plans in any directory ending in /plans/
case "$file_path" in
  */plans/*.md|plans/*.md) ;;
  *) exit 0 ;;
esac

# Skip reviewer outputs to prevent loops
case "$file_path" in
  *.parallel.md|*.diff.md|*.review.md) exit 0 ;;
esac

plan_display="${file_path#"$PWD"/}"

cat <<EOF

─────────────────────────────────────────────────────────────
PLAN WRITTEN: $plan_display

To review, run:
  /review-plan $plan_display
─────────────────────────────────────────────────────────────
EOF

exit 0
