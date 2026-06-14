# Calyflow — Open-Source Recruiting OS

Calyflow lets recruiters run Claude-powered workflows without touching
prompts, skills, or code. The core loop:

> **Browse library → import workflow → attach docs → run → get output doc**

Workspaces hold **clients** (the companies you recruit for), clients hold
**projects** (one per role), and knowledge compounds at every level:
workspace KB ("how WE work"), client KB ("how THEY work"), project files
(JD, intake notes, CVs). Every run injects that context automatically and
streams the result back as a new project document.

**Launch workflows:** Intake-to-JD Builder · Sourcing Strategy Map · Outreach Writer ·
CV Screener · Candidate Submission Pack — a full search lifecycle.

## Stack

- **Next.js** (App Router, standalone output) on **GCP Cloud Run**
- **Supabase** — Postgres + Storage, service-role pattern (server-side only)
- **Clerk** — auth + Organizations (= workspaces), or `SINGLE_WORKSPACE`
  self-host mode with no Clerk dependency
- **Vercel AI SDK** — Anthropic / OpenAI / Google providers with
  priority-ordered fallback; usage + cost logged on every run

## Local development

```bash
npm install
cp .env.example .env.local        # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ENCRYPTION_KEY
npx tsx scripts/seed.ts           # loads /workflows/*.yaml + model catalog snapshot
npm run dev
```

With no Clerk keys set, the app runs in **single-workspace mode**: sign in
with any email; owners come from `ADMIN_EMAILS`. Set `MOCK_AI=true` to test
the full run pipeline without an AI provider key.

### Database

Migrations live in `supabase/migrations/` (plain SQL — apply with the
Supabase CLI: `supabase db push`). The schema is near-plain Postgres by
design; see SPEC §13.

### Workflows

The library's source of truth is `workflows/*.yaml`, seeded into
`library_workflows` by `scripts/seed.ts` (idempotent, upsert-by-slug).
Bump `version` in the YAML to publish an update — users see an opt-in
"v2 available" upgrade on their imported copies.

### Model catalog

`data/model-catalog-snapshot.json` seeds the model dropdowns; a daily job
(`POST /api/cron/sync-models`, bearer `CRON_SECRET`) refreshes the catalog
from [models.dev](https://models.dev). The UI only ever reads the DB.

## Configuration

Every platform-specific behavior is env-driven (see `.env.example`):

| Flag | Effect |
|---|---|
| `SINGLE_WORKSPACE` | Self-host mode: no Clerk orgs, every login lands in one workspace |
| `PLATFORM_PROVIDER_ENABLED` + `CALYFLOW_PLATFORM_API_KEY` | Enables the "Calyflow default" provider with one-time included credit (`ONE_TIME_PLATFORM_CREDIT_DEFAULT_USD`) |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key for BYO API keys at rest — keep in Secret Manager |
| `MOCK_AI` | Dev: canned streaming response, full pipeline incl. usage logging |

Budgets: the platform credit gates only `provider='calyflow'` runs (staff-
adjustable only); the optional monthly spend limit (Settings → General)
gates **all** runs and resets each calendar month.

## Deploying

`.github/workflows/deploy.yml` builds the container, pushes to Artifact
Registry, applies Supabase migrations, and deploys to Cloud Run using
Workload Identity Federation. GCP project / region / WIF settings are repo
variables, so the same workflow deploys any GCP project — see the workflow
file header for the required variables and secrets.

## License

AGPL-3.0 for the platform (see `LICENSE`). Premium workflow bundles are
licensed separately.
