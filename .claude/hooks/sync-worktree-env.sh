#!/usr/bin/env bash
#
# Copy the gitignored .env.local from the MAIN checkout into a git worktree, so
# a freshly created worktree can run the app without a manual copy.
#
# Wired to two hook events (see .claude/settings.json):
#   - PostToolUse(EnterWorktree): copies the moment a worktree is created.
#   - SessionStart: copies when a session starts/resumes already in a worktree.
#
# It AUGMENTS worktree creation (it never overrides it), so it can't break the
# built-in `git worktree add`. Idempotent and best-effort: any failure is logged
# but never blocks the session (always exits 0).
set -uo pipefail

payload="$(cat)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
[ -n "$cwd" ] || exit 0

# Resolve the main checkout root from any worktree: --git-common-dir points at
# the shared .git, whose parent is the primary working tree.
common_dir="$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null)" || exit 0
case "$common_dir" in
  /*) ;;                                  # already absolute
  *)  common_dir="$cwd/$common_dir" ;;    # relative -> make absolute
esac
main_root="$(cd "$(dirname "$common_dir")" 2>/dev/null && pwd)" || exit 0

# The worktree root we're copying INTO (canonical, not a subdir of cwd).
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0

log="$main_root/.claude/logs/worktree-hooks.log"
mkdir -p "$(dirname "$log")" 2>/dev/null || true
ts="$(date '+%Y-%m-%d %H:%M:%S')"

# Only act inside a LINKED worktree (not the main checkout itself).
if [ "$top" = "$main_root" ]; then
  exit 0
fi

src="$main_root/.env.local"
dest="$top/.env.local"
if [ -f "$src" ] && [ ! -f "$dest" ]; then
  if cp "$src" "$dest" 2>>"$log"; then
    echo "$ts  copied .env.local -> $dest" >>"$log" 2>/dev/null || true
  else
    echo "$ts  FAILED to copy .env.local -> $dest" >>"$log" 2>/dev/null || true
  fi
fi

exit 0
