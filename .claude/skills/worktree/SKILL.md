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

3. Verify the result: run `git status` and `git log --oneline -1` and confirm the branch is based on the tip of `origin/main`. Capture the **absolute worktree path** (run `pwd`) and report it, along with the branch name, to the user.

## Working in the worktree — CRITICAL

Once the session is in the worktree, **every** file read/write/edit and shell command must target the worktree, not the original checkout. The original repo root and the worktree are two separate working trees of the same repo; touching the wrong one silently lands your changes in the wrong place.

- **Never use an absolute path to the original repo root** (e.g. `/…/calyflow-website/src/…`). Use relative paths, or absolute paths under the worktree (`/…/calyflow-website/.claude/worktrees/<name>/src/…`). A bare absolute path to the project root writes to the *original* checkout, not the worktree.
- **Never `cd` to the original repo root**, and don't prefix shell commands with `cd /…/calyflow-website && …`. Run commands from the worktree cwd (relative paths), or use `git -C "$(pwd)"` / `git -C <worktree-path>`.
- The Bash tool resets cwd to the worktree each call — rely on that; do not override it with an absolute `cd` elsewhere.
- **Guard before any build/commit:** the original repo's working tree should stay clean. If you ran a build or edited files and `git -C <original-repo-root> status --short` shows your changes there instead of in the worktree, your paths were wrong — stop and redo them against the worktree path.

## Fallback: base ref is not main

If the session's `worktree.baseRef` setting is `head` (so `EnterWorktree` would branch from the current HEAD instead of main), create the worktree manually and enter it by path:

```bash
git fetch origin main
git worktree add .claude/worktrees/<name> -b <name> origin/main
```

Then call `EnterWorktree` with `path: .claude/worktrees/<name>`. After entering, run `pwd` and treat that path as the only place you work — the **Working in the worktree** rules above apply with extra care here, since a path-entered worktree lives beside the original checkout and absolute project-root paths are an easy mistake.

Note: a worktree entered via `path` is not removed by `ExitWorktree` — exit with `action: "keep"` and clean up with `git worktree remove` when the work is merged or abandoned.

## Leaving

Only when the user asks to leave: use `ExitWorktree` with `action: "keep"` to preserve the work, or `action: "remove"` to delete the worktree and branch.
