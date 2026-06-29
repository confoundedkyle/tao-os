<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:knowledge-base -->
# Read the knowledge base first

At the **start of every session**, review all articles in `knowledge-base/*` —
they capture how the app works (`requirements.md`) and the engineering conventions
(`standards.md`). They're the fastest way to get oriented before reading code, and
keep features consistent across sessions. Keep them up to date when you learn
something durable.
<!-- END:knowledge-base -->

<!-- BEGIN:worktree-path-discipline -->
# When working in a git worktree, edit inside it

If the session is in a worktree (cwd contains `/.claude/worktrees/<name>/`), the original repo checkout still exists at the repo root with the same file tree. **Every Read/Edit/Write must target a path under the worktree**, i.e. one containing `/.claude/worktrees/<name>/`.

`Explore`/`Plan` subagents, `Grep`, and `Glob` report paths rooted at the **original repo** (e.g. `/Users/you/Projects/repo/lib/foo.ts`). Don't edit those verbatim — translate to the worktree (`…/repo/.claude/worktrees/<name>/lib/foo.ts`) or use worktree-relative paths. After your first edit, confirm `git status` shows it in the worktree and the repo root stays clean. Misplaced edits land on `main` and the worktree branch stays empty.
<!-- END:worktree-path-discipline -->

<!-- BEGIN:pr-closes-issues -->
# Close issues from PRs with a keyword

When a PR resolves a GitHub issue, put a **closing keyword** in the PR body (or a commit message): `Closes #123`, `Fixes #123`, or `Resolves #123`. GitHub then auto-closes the issue when the PR merges to `main`. Plain references like "Implements #123" or "Addresses #123" only *link* the issue — they do **not** close it. Use one keyword per issue the PR resolves.
<!-- END:pr-closes-issues -->

<!-- BEGIN:pr-automerge -->
# PRs should auto-merge

Once a PR is open, enable auto-merge so it lands as soon as checks pass — don't wait around to merge it by hand. Default to squash + delete the branch: `gh pr merge --squash --auto --delete-branch`. (Merging to `main` triggers the prod deploy pipeline, so make sure checks are expected to pass before enabling it.)
<!-- END:pr-automerge -->

