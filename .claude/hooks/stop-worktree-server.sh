#!/usr/bin/env bash
#
# Stop a dev server that was started for THIS worktree when the session ends, so
# `next dev` processes don't linger after you're done. Wired to SessionEnd.
#
# Safety:
#   - Only kills the PID recorded in this worktree's pidfile
#     (.claude/.dev-server.pid) — never another worktree's server, never a blanket
#     `pkill next dev`. The run-app skill writes that pidfile on start.
#   - Skips `clear`/`resume`, which are continuations (the session keeps going),
#     so an active dev server isn't killed mid-work.
#   - Best-effort: always exits 0.
set -uo pipefail

payload="$(cat)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
reason="$(printf '%s' "$payload" | jq -r '.reason // empty')"
[ -n "$cwd" ] || exit 0

# `clear` and `resume` mean the session continues — leave the server running.
case "$reason" in
  clear|resume) exit 0 ;;
esac

top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo "$cwd")"
pidfile="$top/.claude/.dev-server.pid"
[ -f "$pidfile" ] || exit 0

pid="$(cat "$pidfile" 2>/dev/null || true)"

# Kill the whole process tree (npm -> next dev -> turbopack workers).
kill_tree() {
  local p="$1" c
  for c in $(pgrep -P "$p" 2>/dev/null); do kill_tree "$c"; done
  kill "$p" 2>/dev/null || true
}

if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
  kill_tree "$pid"
  sleep 0.3
  kill -9 "$pid" 2>/dev/null || true
fi
rm -f "$pidfile" 2>/dev/null || true

exit 0
