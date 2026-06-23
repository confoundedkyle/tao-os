-- Sourcing Plan ("Plan mode" for a project).
--
-- 1) A PRIVATE storage bucket for system configuration that must NOT live in
--    the repo (it would be public). The Sourcing Plan harness — the prompt/IP
--    that drives plan generation — is uploaded here out-of-band
--    (scripts/upload-harness.mjs) and pulled server-side at runtime
--    (lib/sourcing-plan/harness.ts). The bucket is created empty here; the
--    harness object is never part of a migration or the git tree.
insert into storage.buckets (id, name, public)
values ('system-config', 'system-config', false)
on conflict (id) do nothing;

-- 2) Chat/run history for sourcing-plan generation and revision. Kept separate
--    from agent_runs because those rows require a workspace_agent_id (a seeded
--    agent), whereas the plan is driven by the private harness, not a stored
--    agent. Each row is one turn; turns of one chat share conversation_id.
create table if not exists sourcing_plan_runs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects not null,
  -- Groups the turns of one chat; each turn (generate / revision) is its own row.
  conversation_id    uuid,
  status             text,        -- running | succeeded | failed
  -- "generate" (first draft / regenerate) or the user's revision instruction.
  task               text,
  steps              jsonb,       -- [{ type, tool, summary }] tool-call trace
  -- The full plan markdown produced by this turn (also saved as the active
  -- sourcing_plan document).
  output_text        text,
  -- The sourcing_plan document this turn wrote.
  output_doc_id      uuid references documents,
  error_message      text,
  provider           text,
  model              text,
  input_tokens       int,
  output_tokens      int,
  cache_read_tokens  int,
  cost_usd           numeric(10,6),
  created_by         text,
  created_at         timestamptz default now()
);
create index if not exists sourcing_plan_runs_project_idx
  on sourcing_plan_runs (project_id, conversation_id, created_at);

alter table sourcing_plan_runs enable row level security;
