---
name: worktree
description: Create a new git worktree branched from main and switch the session into it. Use when the user asks to start a worktree, work in a worktree, or spin up an isolated checkout for a task.
---

# worktree

Create a fresh git worktree branched from `main` and move this session into it.

Arguments: `$ARGUMENTS` — optional worktree/branch name (kebab-case). If empty, derive a short name from the task at hand, or let one be generated.

## Steps

1. Make sure `origin/main` is current so the new branch starts from the latest main:

   ```bash
   git fetch origin main
   ```

2. Call the `EnterWorktree` tool with `name` set to the requested name (omit it if none was given). By default (`worktree.baseRef` = `fresh`) this creates the worktree under `.claude/worktrees/` on a new branch based on `origin/main` and switches the session's working directory into it.

3. Verify the result: run `git status` and `git log --oneline -1` and confirm the branch is based on the tip of `origin/main`. Report the worktree path and branch name to the user.

## Fallback: base ref is not main

If the session's `worktree.baseRef` setting is `head` (so `EnterWorktree` would branch from the current HEAD instead of main), create the worktree manually and enter it by path:

```bash
git fetch origin main
git worktree add .claude/worktrees/<name> -b <name> origin/main
```

Then call `EnterWorktree` with `path: .claude/worktrees/<name>`.

Note: a worktree entered via `path` is not removed by `ExitWorktree` — exit with `action: "keep"` and clean up with `git worktree remove` when the work is merged or abandoned.

## Leaving

Only when the user asks to leave: use `ExitWorktree` with `action: "keep"` to preserve the work, or `action: "remove"` to delete the worktree and branch.
