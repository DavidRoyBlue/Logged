#!/usr/bin/env bash
# PreToolUse hook attached to the parallel-planner subagent via frontmatter.
# Because of frontmatter scoping, this only fires while that subagent is active —
# we don't need to check agent identity in the script itself.
#
# Blocks any read of files under plans/, enforcing context isolation at the
# tool layer instead of trusting the agent's prompt to obey "MUST NOT" rules.

set -euo pipefail

event_json="$(cat)"

tool_name="$(jq -r '.tool_name // empty' <<<"$event_json")"

# Only police read-shaped tools; Write/Edit etc. fall through unchanged.
case "$tool_name" in
  Read|Glob|Grep) ;;
  *) exit 0 ;;
esac

# Different read tools use different field names for the target.
# Read  -> tool_input.file_path
# Glob  -> tool_input.pattern (+ optional tool_input.path)
# Grep  -> tool_input.path (+ tool_input.pattern for the regex)
target="$(jq -r '
  .tool_input.file_path
  // .tool_input.path
  // .tool_input.pattern
  // empty
' <<<"$event_json")"

[[ -n "$target" ]] || exit 0

# Block any access into a plans/ directory.
case "$target" in
  *plans/*|plans/*|*plans/**|plans/**)
    cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "parallel-planner is forbidden from reading plans/. You must produce an independent plan from the spec alone. This is enforced at the tool layer to guarantee context isolation; the diff stage will compare your plan against the implementer's later."
  }
}
EOF
    exit 0
    ;;
esac

exit 0
