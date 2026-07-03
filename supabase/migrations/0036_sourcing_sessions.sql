-- Per-session state for the Sourcing cockpit. A "session" is one strategist
-- conversation (sourcing_strategy_runs.conversation_id) plus the runs it spawned.
-- Sessions are otherwise implicit (grouped by conversation_id); this table holds
-- the mutable per-session bits — for now, whether the recruiter has ARCHIVED it.
-- Archiving only hides a session from the top of the cockpit's session rail
-- (it drops to a muted "Archived" group); it stays fully in Settings → Usage,
-- which reads the run tables directly.
create table if not exists sourcing_sessions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects not null,
  conversation_id uuid not null unique,
  archived_at     timestamptz,
  created_at      timestamptz default now()
);
create index if not exists sourcing_sessions_project_idx
  on sourcing_sessions (project_id);

alter table sourcing_sessions enable row level security;
