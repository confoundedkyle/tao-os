# Engineering standards & conventions

## Stack
- **Next.js (modified — breaking changes from training data).** Read the relevant
  guide in `node_modules/next/dist/docs/` before writing Next code.
- App Router, server components by default; `"use client"` only where needed.
- Supabase (Postgres + storage). Local dev DB at `127.0.0.1:54321/54322`.
- Tailwind v4 — tokens in `app/globals.css` `@theme` (no tailwind.config).

## Where code goes
- Pages/routes: `app/(app)/**`. API: `app/api/**`.
- Server actions: `lib/actions/*.ts` (`"use server"`).
- DB queries: `lib/queries.ts` — use `db()`, always **workspace-scope** reads.
- Types: `lib/types.ts`. Pure graph logic: `lib/workflow-graph.ts` (client-safe).
- UI primitives: `components/ui.tsx` — `Button`, `ButtonLink`, `Card`, `Chip`,
  `Mono`, `PageHeader` (`wide?` widens the description), `EmptyState`, `Field`,
  `inputClass`. Icons: `components/icons.tsx`. **No shadcn/Radix** — build with these.
- Reusable bits seen this session: `DocExplorer` (file list + md/txt edit + rename +
  delete + `DownloadButtons` MD/PDF/DOCX; `allowUpload`, `scopeType` incl. `project`),
  `AgentContextBadge`, `WorkflowCanvas`, `PromptDialog`.

## Design system
Colors: `cream`, `navy`, `mint`, `sky`, `lavender`, `amber` (warning/missing),
`coral` (danger). Radii: `rounded-chip|card|panel`. Fonts: Space Grotesk (display),
Inter (sans), JetBrains Mono. UI should be modern/colorful/screenshot-worthy.
Tailwind gotcha: to override a same-property utility, **swap the class
conditionally** (e.g. `max-w-none` vs `max-w-[68ch]`) — appending won't win.

## State / client patterns
- localStorage persistence: use `usePersistedSelection` or `useSyncExternalStore`
  (the lint rule `react-hooks/set-state-in-effect` blocks setState-in-effect).
- Toasts: `useToast()` + `Toast`.

## Migrations & seed (sensitive — see memory)
- Migrations: `supabase/migrations/NNNN_name.sql`, numbered. Apply locally with
  `supabase migration up --local`. A migration that adds a column the **seed**
  writes must be applied **before** the seed, or the seed breaks.
- Seed: `scripts/seed.ts`, idempotent upsert by `slug`, retires removed slugs.
  Run: `env $(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env.local | xargs) npx tsx scripts/seed.ts`.
  After editing `agents/*.yaml` or adding agent columns, **reseed**. Imported
  workspace copies are snapshots — reseed updates the library, not existing copies.
- Deploy is **GitHub Actions only** (never the console Cloud Build trigger).

## Running & verifying (don't ship on typecheck alone)
- Use the **run-app skill**: copies `.env.local` into the worktree, `npm run dev`.
  `SINGLE_WORKSPACE=true` enables headless sign-in (first `ADMIN_EMAILS`); drive
  with `scripts/drive.mjs` (Playwright). Actually run the app and look.
- **Gotcha:** agent runs stream NDJSON for minutes. A browser/Playwright client
  that closes mid-stream aborts the run → `"Controller is already closed"` →
  status `failed` (a test artifact, not a real bug). To verify a full run, keep
  the tab open, or consume the stream to completion from Node with the session
  cookie.
- After a route rename, clear stale Next types: `rm -rf .next/dev/types .next/types`
  and restart dev so the running server recompiles.

## Quality gates (run before reporting done)
- `npm run typecheck`, `npm run lint`, `npm run test` (vitest).
- Update test fixtures when a shared type gains a required field (e.g.
  `tests/api/v1-library.test.ts`).
- Remove throwaway verification scripts; keep the repo root clean (worktree only).
