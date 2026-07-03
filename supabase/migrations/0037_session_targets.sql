-- Per-session goal + budget for the Sourcing cockpit. Goal and budget now live on
-- the SESSION (one strategist conversation), not the project: each session pursues
-- its own goal within its own budget. The PROJECT-level budget
-- (projects.sourcing_budget_usd) stays as the overall cap, managed in Project
-- Settings, and gates every session.
alter table sourcing_sessions
  add column if not exists goal_qualified int,
  add column if not exists budget_usd     numeric(10,2);

-- Attribute each sourcing run to the session that launched it, so a session's
-- qualified-added and spend can be summed for its own goal/budget gates. Runs are
-- serialised per project (one running at a time), so per-run qualified_after
-- deltas attribute cleanly to their session.
alter table shortlist_runs
  add column if not exists conversation_id uuid;
create index if not exists shortlist_runs_conversation_idx
  on shortlist_runs (conversation_id, created_at);
