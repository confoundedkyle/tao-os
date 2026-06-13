<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:worktree-path-discipline -->
# When working in a git worktree, edit inside it

If the session is in a worktree (cwd contains `/.claude/worktrees/<name>/`), the original repo checkout still exists at the repo root with the same file tree. **Every Read/Edit/Write must target a path under the worktree**, i.e. one containing `/.claude/worktrees/<name>/`.

`Explore`/`Plan` subagents, `Grep`, and `Glob` report paths rooted at the **original repo** (e.g. `/Users/you/Projects/repo/lib/foo.ts`). Don't edit those verbatim — translate to the worktree (`…/repo/.claude/worktrees/<name>/lib/foo.ts`) or use worktree-relative paths. After your first edit, confirm `git status` shows it in the worktree and the repo root stays clean. Misplaced edits land on `main` and the worktree branch stays empty.
<!-- END:worktree-path-discipline -->

