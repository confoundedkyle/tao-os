-- Dynamic data agents. A first-class type distinct from prompt-template
-- workflows: an agent is an instruction prompt + a set of allowed tools that
-- the model calls in a multi-step loop. Mirrors the library/workspace split of
-- workflows (seeded from /agents/*.yaml, imported per workspace).

-- Global catalog (seeded from /agents/*.yaml)
create table library_agents (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,
  name          text,
  description   text,
  instructions  text,            -- system/goal prompt
  allowed_tools jsonb,           -- string[] of tool names from the registry
  model         text,            -- optional model override; null = workspace default
  max_steps     int default 12,  -- tool-loop step budget
  version       int default 1
);

-- Imported copies (snapshot at import)
create table workspace_agents (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references workspaces not null,
  library_agent_id  uuid references library_agents,
  name              text,
  instructions      text,
  allowed_tools     jsonb,
  model             text,
  max_steps         int default 12,
  imported_version  int,
  created_at        timestamptz default now()
);
create index workspace_agents_workspace_idx on workspace_agents (workspace_id);

-- Execution log for agent runs (parallel to workflow_runs). `steps` holds the
-- tool-call trace for transparency/debugging.
create table agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects not null,
  workspace_agent_id uuid references workspace_agents not null,
  status             text,        -- running | succeeded | failed
  task               text,        -- the objective the user typed for this run
  steps              jsonb,       -- [{ type, tool, input, output|summary }]
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
create index agent_runs_project_idx on agent_runs (project_id);

alter table library_agents enable row level security;
alter table workspace_agents enable row level security;
alter table agent_runs enable row level security;
