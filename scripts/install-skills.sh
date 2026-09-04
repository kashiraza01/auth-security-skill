#!/usr/bin/env bash
#
# Install the auth security skillset into Claude Code.
#
#   ./scripts/install-skills.sh                  # all three skills + subagents, user-scoped (~/.claude)
#   ./scripts/install-skills.sh --project        # into ./.claude of the current directory instead
#   ./scripts/install-skills.sh breaker          # just the auditor
#   ./scripts/install-skills.sh breaker hardener # a subset
#   ./scripts/install-skills.sh --force          # overwrite existing installs
#
# The skills are plain files with no dependencies. This script only copies them.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="$HOME/.claude"
FORCE=0
SELECTED=()

for arg in "$@"; do
  case "$arg" in
    --project)  DEST_ROOT="$PWD/.claude" ;;
    --force|-f) FORCE=1 ;;
    --help|-h)  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    breaker|hardener|loop) SELECTED+=("auth-security-$arg") ;;
    auth-security-breaker|auth-security-hardener|auth-security-loop) SELECTED+=("$arg") ;;
    *) echo "unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

if [ ${#SELECTED[@]} -eq 0 ]; then
  SELECTED=(auth-security-breaker auth-security-hardener auth-security-loop)
fi

echo "installing into $DEST_ROOT"
mkdir -p "$DEST_ROOT/skills"

installed=0
skipped=0

for skill in "${SELECTED[@]}"; do
  src="$REPO_ROOT/skills/$skill"
  dest="$DEST_ROOT/skills/$skill"

  if [ ! -d "$src" ]; then
    echo "  missing in this repo: $skill" >&2
    exit 1
  fi

  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skipped  $skill (already installed; re-run with --force to overwrite)"
    skipped=$((skipped + 1))
    continue
  fi

  rm -rf "$dest"
  cp -R "$src" "$dest"
  echo "  installed $skill"
  installed=$((installed + 1))
done

# auth-security-loop dispatches two subagents; without them it has no hands.
needs_agents=0
for skill in "${SELECTED[@]}"; do
  [ "$skill" = "auth-security-loop" ] && needs_agents=1
done

if [ "$needs_agents" -eq 1 ]; then
  mkdir -p "$DEST_ROOT/agents"
  for agent in auth-breaker auth-hardener; do
    src="$REPO_ROOT/.claude/agents/$agent.md"
    dest="$DEST_ROOT/agents/$agent.md"
    if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
      echo "  skipped  $agent subagent (already present)"
    else
      cp "$src" "$dest"
      echo "  installed $agent subagent"
    fi
  done
fi

echo
echo "$installed installed, $skipped skipped."
echo
echo "Node $(node --version 2>/dev/null || echo 'not found') — the probe CLI needs 18 or newer."
echo "Restart Claude Code, then ask for what you want:"
echo "  \"audit the auth on localhost:3000\""
echo "  \"act on the breaker's findings\""
echo "  \"run the break-fix loop until it holds\""
