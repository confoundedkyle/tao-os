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

3. Verify the result: run `git status` and `git log --oneline -1` and confirm the branch is based on the tip of `origin/main`. **Note the absolute worktree path** (e.g. `/Users/you/Projects/repo/.claude/worktrees/<name>`) — you'll need it for every edit below. Report the worktree path and branch name to the user.

## Critical: edit INSIDE the worktree, never the original repo

After `EnterWorktree`, the session works in the worktree, but the **original repo checkout still exists** at the repo root. Both contain the same file tree, so it's easy to edit the wrong copy. If you write to the original repo's paths, your changes land on its branch (usually `main`) and the worktree branch stays empty — the app you run from the worktree won't have them.

**The trap:** `Explore`/`Plan` subagents, `Grep`, and `Glob` report paths rooted at the **original repo** (e.g. `/Users/you/Projects/repo/lib/foo.ts`), because that's where they searched. Those paths point at the *original checkout*, not the worktree. Editing them verbatim is the mistake.

Rules for every Read/Edit/Write after entering a worktree:

- **Translate reported paths to the worktree.** Replace the repo root with the worktree root: `/Users/you/Projects/repo/lib/foo.ts` → `/Users/you/Projects/repo/.claude/worktrees/<name>/lib/foo.ts`. Or use a path relative to the worktree cwd (`lib/foo.ts`). Never edit a path that contains the repo root but **not** `/.claude/worktrees/<name>/`.
- **Any absolute path you edit must contain `/.claude/worktrees/<name>/`.** If it doesn't, stop and re-point it.
- **Verify before trusting it.** After your first edit and again before reporting done, run `git -C <worktree-path> status` — your changes must appear there. Also confirm `git -C <repo-root> status` is **clean**. If the changes show up in the repo root instead, they're misplaced.

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

Then call `EnterWorktree` with `path: .claude/worktrees/<name>`.

Note: a worktree entered via `path` is not removed by `ExitWorktree` — exit with `action: "keep"` and clean up with `git worktree remove` when the work is merged or abandoned.

## Leaving

Only when the user asks to leave: use `ExitWorktree` with `action: "keep"` to preserve the work, or `action: "remove"` to delete the worktree and branch.
