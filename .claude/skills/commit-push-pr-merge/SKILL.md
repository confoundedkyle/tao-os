---
name: commit-push-pr-merge
description: Commit all working-tree changes in logical units, push the branch, open a PR, wait for checks, and merge to main when green and conflict-free. Use when the user wants to ship the current branch end-to-end (e.g. "ship it", "commit and merge", "get this into main").
---

# Commit → Push → PR → Merge

Ship the current working tree to main in one flow. Stop and report at the first
gate that fails — never force a merge.

## 1. Inspect and group the changes

- Run `git status` and `git diff` (plus `git diff --stat` for an overview) and
  read the untracked files. Run `git log --oneline -5` to match the repo's
  commit-message style.
- If on `main`, create a feature branch first (`git checkout -b <topic>`).
  Never commit directly to main.
- Group the changes into logical units: one commit per distinct feature, fix,
  or concern. Unrelated changes (e.g. a new feature + an unrelated bugfix +
  tooling changes) get separate commits via targeted `git add <paths>`.
  If everything serves one change, one commit is fine — don't split
  artificially.
- Write each message in the repo's style: short imperative subject (~50 chars),
  body only when the why isn't obvious from the diff.
- Do not commit secrets, `.env` files, or generated artifacts; if the diff
  contains one, stop and ask.

## 2. Push and open the PR

- Push with `git push -u origin <branch>`. Push the branch you are actually on
  (`git branch --show-current`) — don't assume a remembered branch name.
- If the branch already has an open PR (`gh pr view --json url,state` exits 0
  with state OPEN), reuse it. Otherwise create one:
  `gh pr create --base main --title <subject> --body <summary>`.
- PR body: a short summary of what changed and why, a test plan (what was run:
  tests, lint, build), ending with the standard generation footer.

## 3. Wait for checks

- Watch checks with `gh pr checks --watch --fail-fast` (give the Bash call a
  long timeout, e.g. 600000 ms). If a watch could exceed the timeout, poll
  `gh pr checks` in a background loop instead and continue when all checks
  report a terminal state.
- If any check fails: fetch the failing run's log
  (`gh run view <id> --log-failed`), report the failure with the relevant
  output, and stop. Fix only if the user asks.

## 4. Merge gate and merge

- Verify mergeability: `gh pr view --json mergeable,mergeStateStatus`. If
  `mergeable` is CONFLICTING or the state is DIRTY/BLOCKED, report it and stop
  — do not rebase or resolve conflicts unprompted.
- Merge only when all checks pass AND there are no conflicts.
- Prefer a merge commit when the branch holds multiple logical commits
  (`gh pr merge --merge --delete-branch`); use squash for a single-commit
  branch (`gh pr merge --squash --delete-branch`). If the repo disallows the
  preferred method (check `gh repo view --json mergeCommitAllowed,squashMergeAllowed`),
  use whichever is allowed.
- After merging: `git checkout main && git pull`, and report the merged PR URL.

## Repo note (calyflow-app)

Merging to `main` triggers the Deploy workflow (verify job → Docker build →
Cloud Run production deploy). State this in the final report so the user knows
a prod deploy is in flight, and mention they can watch it with
`gh run watch`.
