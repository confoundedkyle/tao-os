-- Connector credit usage + per-connector spend budgets.
--
-- Data-source connectors (Coresignal, Firecrawl, ContactOut, …) are priced per
-- search/credit, separate from the AI token cost the Shortlist "Budget (USD)"
-- field already tracks. This records what each metered connector actually spent,
-- associated with the search run that spent it, and lets the recruiter cap
-- per-connector spend per project (in each connector's native unit).

-- 1) Per-run, per-connector credit ledger. One row per metered tool call that
--    spent credits. shortlist_run_id is nullable so the same metered tools used
--    outside a shortlist run (e.g. a library agent) still record spend.
create table if not exists connector_credit_usage (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references workspaces not null,
  project_id        uuid references projects not null,
  shortlist_run_id  uuid references shortlist_runs,
  -- Connector provider slug (coresignal | firecrawl | contactout | …).
  provider          text not null,
  -- Credits/searches spent (native unit of the provider). Estimated from the
  -- tool's own accounting; not authoritative billing.
  credits           numeric(12,2) not null default 0,
  -- Free-form detail (e.g. the ladder tier log) for auditing.
  detail            jsonb,
  created_at        timestamptz default now()
);
-- Trace a run's spend, and sum per provider for "spent of cap" + the live cap.
create index if not exists connector_credit_usage_run_idx
  on connector_credit_usage (shortlist_run_id);
create index if not exists connector_credit_usage_project_provider_idx
  on connector_credit_usage (project_id, provider);

alter table connector_credit_usage enable row level security;

-- 2) Per-project per-connector spend caps the recruiter sets on the Shortlist
--    tab: { "coresignal": 40, "firecrawl": 100, … } in each connector's native
--    unit. Absent / missing key = no cap (unlimited), like a blank USD budget.
alter table projects
  add column if not exists sourcing_connector_budgets jsonb not null default '{}'::jsonb;
