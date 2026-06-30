-- Knowledge-base onboarding chat history.
--
-- The guided "Start creating" assistant on the Knowledge base tab builds the
-- workspace KB through a conversation. Each assistant turn is one row here
-- (mirroring qualification_runs), grouped by conversation_id, so the chat is
-- resumable across sessions — the user can answer a few areas today and pick up
-- where they left off another day. Workspace-scoped (no project).

create table if not exists kb_onboarding_runs (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid references workspaces not null,
  conversation_id    uuid,
  status             text,        -- running | succeeded | failed
  task               text,        -- the user's message for this turn (null = first/auto turn)
  steps              jsonb,
  output_text        text,        -- the assistant's reply for this turn
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

create index if not exists kb_onboarding_runs_workspace_idx
  on kb_onboarding_runs (workspace_id, conversation_id, created_at);

alter table kb_onboarding_runs enable row level security;
