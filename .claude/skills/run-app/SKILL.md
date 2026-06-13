---
name: run-app
description: Launch the Calyflow Next.js app locally and drive it. Use when asked to run, start, serve, or screenshot the app, or to confirm a change works in the running app. Handles copying .env.local into a git worktree before starting the dev server.
---

# run-app

Launch the Calyflow web app (`next dev`) with real configuration and drive it
through the browser. The app is a Next.js 16 app that needs a populated
`.env.local` (Supabase, AI provider, connector keys) — without it the server
boots but every DB-backed page redirects to `/sign-in` and nothing real works.

The canonical config lives in the **main repo** at
`/Users/michaljuhas/Projects/calyflow-app/.env.local`. It is gitignored, so a
fresh worktree under `.claude/worktrees/<name>` does **not** have it — copy it
in first.

## Steps

1. **Get `.env.local`.** If the current directory is a worktree (its path
   contains `/.claude/worktrees/`) and there's no local `.env.local`, copy it
   from the main repo:

   ```bash
   MAIN=/Users/michaljuhas/Projects/calyflow-app
   [ -f .env.local ] || cp "$MAIN/.env.local" .env.local
   ```

   If neither this directory nor the main repo has `.env.local`, stop and tell
   the user — the app can't run without it (`cp .env.example .env.local` then
   fill in Supabase + keys).

2. **Install deps if needed** (only when `node_modules` is missing):

   ```bash
   [ -d node_modules ] || npm ci
   ```

3. **Start the dev server** in the background and wait for "Ready". Next picks
   an open port (3000, else 3002, …) — read the actual URL from the log:

   ```bash
   npm run dev > /tmp/calyflow-dev.log 2>&1 &
   for i in $(seq 1 40); do grep -q "Ready in" /tmp/calyflow-dev.log && break; sleep 1; done
   grep -E "Local:|Ready in" /tmp/calyflow-dev.log
   ```

   Note the `Local: http://localhost:<port>` line; use that port below.

4. **Smoke-check it serves:**

   ```bash
   curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:<port>/sign-in
   ```

   `200` on `/sign-in` means the app is up. App pages (`/`, `/clients/...`)
   redirect to `/sign-in` (307) until you have a session cookie — that's
   expected, not a failure.

## Drive it (don't just launch it)

**Auth mode decides whether you can drive it headlessly.** Check `.env.local`:

- `SINGLE_WORKSPACE=true` (no Clerk): the sign-in form logs in by email via a
  signed cookie — use the email in `ADMIN_EMAILS`. Drive it with the project's
  own browser driver (Playwright is a devDependency; there is no `chromium-cli`
  in this repo):

  ```bash
  BASE_URL="http://localhost:<port>" npm run drive /workflows
  # → signs in with the first ADMIN_EMAILS, opens the path, writes
  #   /tmp/calyflow-<slug>.png, and prints any console errors.
  # args: npm run drive <path> [outfile];  env: DRIVE_EMAIL, FULL_PAGE=1
  ```

  Then **look at the screenshot** — the script exits non-zero and warns if it
  landed back on `/sign-in` (protected page with no session). See
  `scripts/drive.mjs` to extend it (clicks, fills, multi-step flows).
- `SINGLE_WORKSPACE=false` (the main repo's `.env.local` default): auth is
  **Clerk**, so protected pages redirect to `…accounts.dev/sign-in` and there's
  no headless login. To drive the UI locally, either log in once in a real
  browser you control, or temporarily set `SINGLE_WORKSPACE=true` in the
  worktree's `.env.local` and sign in with the `ADMIN_EMAILS` address. Without
  that, you can only confirm the server boots and routes compile (curl the
  endpoints — protected ones return 307 to Clerk, which is correct).

For the client domain-import feature specifically: open a client →
**Knowledge base**, confirm the "✨ Import from website" control shows (it only
renders when `FIRECRAWL_API_KEY` is set), enter a domain, and watch the live
progress steps stream in.

## Notes

- `MOCK_AI=true` in `.env.local` streams a canned AI response (no provider
  call) — handy for UI work, but the import agent won't really scrape. Unset it
  (or set `false`) to drive the real agent loop.
- Stop the server when done: `pkill -f "next dev"`.
- The "multiple lockfiles" Turbopack warning is benign in a worktree.
