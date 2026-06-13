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

3. Verify the result: run `git status` and `git log --oneline -1` and confirm the branch is based on the tip of `origin/main`. Capture the **absolute worktree path** (run `pwd`, e.g. `/Users/you/Projects/repo/.claude/worktrees/<name>`) — you'll need it for every edit below — and report it, along with the branch name, to the user.

## Working in the worktree — CRITICAL

Once the session is in the worktree, **every** file read/write/edit and shell command must target the worktree, not the original checkout. The original repo root and the worktree are two separate working trees of the same repo; touching the wrong one silently lands your changes on the original's branch (usually `main`), leaving the worktree branch empty — and the app you run from the worktree won't have them.

**The trap:** `Explore`/`Plan` subagents, `Grep`, and `Glob` report paths rooted at the **original repo** (e.g. `/Users/you/Projects/repo/lib/foo.ts`), because that's where they searched. Editing those verbatim writes to the original checkout, not the worktree.

Rules for every Read/Edit/Write and shell command after entering a worktree:

- **Translate reported paths to the worktree.** Replace the repo root with the worktree root: `/Users/you/Projects/repo/lib/foo.ts` → `/…/repo/.claude/worktrees/<name>/lib/foo.ts`, or use a path relative to the worktree cwd (`lib/foo.ts`). Never edit an absolute path that contains the repo root but **not** `/.claude/worktrees/<name>/`.
- **Never `cd` to the original repo root** or prefix commands with `cd /…/repo && …`. The Bash tool resets cwd to the worktree each call — rely on that (relative paths), or use `git -C "$(pwd)"` / `git -C <worktree-path>`.
- **Verify before trusting it.** After your first edit, and again before any build/commit or reporting done, run `git -C <worktree-path> status` — your changes must appear there — and confirm `git -C <repo-root> status` is **clean**. If the changes show up in the repo root instead, your paths were wrong; stop and redo them.

### Recovery if edits landed in the original repo

Worktrees share one object store, so the stash list is shared. Move misplaced changes without redoing them:

```bash
git -C <repo-root> stash push -u -m "misplaced; moving to worktree"   # repo root now clean
git -C <worktree-path> stash pop                                       # changes appear in the worktree
```

Then re-run `git -C <worktree-path> status` to confirm, and restart any dev server so it picks up the relocated files.

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
