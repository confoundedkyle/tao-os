-- Calyflow MVP — initial schema (SPEC.md §4)

create extension if not exists "pgcrypto";

-- Identity / tenancy
create table workspaces (
  id              uuid primary key default gen_random_uuid(),
  clerk_org_id    text unique not null,
  name            text not null,
  workspace_type  text,            -- 'independent' | 'agency' | 'inhouse'
  trial_ends_at   timestamptz,     -- set for agency/inhouse; null = no trial clock
  one_time_platform_credit_usd numeric(10,2),
  one_time_platform_credit_spent_usd numeric(10,2) default 0,
  monthly_spend_limit_usd numeric(10,2),
  created_at      timestamptz default now()
);
-- Membership, roles, invites: handled by Clerk Organizations.

-- Hierarchy
create table clients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  name          text not null,
  status        text default 'active',
  created_at    timestamptz default now()
);
create index clients_workspace_idx on clients (workspace_id);

create table projects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients not null,
  name          text not null,                -- "Senior DevOps – Berlin"
  status        text default 'active',        -- active | archived
  created_at    timestamptz default now()
);
create index projects_client_idx on projects (client_id);

-- Workflow library (global catalog, seeded from /workflows/*.yaml)
create table library_workflows (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,
  name            text,
  description     text,
  category        text,
  prompt_template text,
  input_spec      jsonb,    -- e.g. {"inputs": ["document"], "output": "document"}
  output_spec     jsonb,
  version         int default 1
);

-- Imported copies (snapshot at import)
create table workspace_workflows (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references workspaces not null,
  library_workflow_id uuid references library_workflows,
  name                text,
  prompt_template     text,
  imported_version    int,
  created_at          timestamptz default now()
);
create index workspace_workflows_workspace_idx on workspace_workflows (workspace_id);

-- AI provider configuration (workspace settings)
create table workspace_ai_providers (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references workspaces not null,
  provider          text not null,    -- 'calyflow' | 'anthropic' | 'openai' | 'google' | ...
  api_key_cipher    text,             -- encrypted at rest; null for 'calyflow'
  key_last4         text,             -- display only
  default_model     text,             -- per-provider default, from model_catalog
  priority          int not null,     -- 1 = primary (active), 2+ = fallback order
  status            text default 'unverified',  -- unverified | valid | invalid
  last_validated_at timestamptz,
  unique (workspace_id, provider),
  unique (workspace_id, priority) deferrable initially deferred
);

-- Model catalog, synced server-side from models.dev
create table model_catalog (
  provider       text,
  model_id       text,
  display_name   text,
  context_window int,
  pricing        jsonb,
  raw            jsonb,
  curated        boolean default false,   -- shortlist shown by default in dropdowns
  synced_at      timestamptz,
  primary key (provider, model_id)
);

-- Unified documents table: every scope, both kinds
create table documents (
  id             uuid primary key default gen_random_uuid(),
  scope_type     text not null,   -- 'workspace' | 'client' | 'project'
  scope_id       uuid not null,
  workspace_id   uuid references workspaces not null,
  kind           text not null,   -- 'kb' | 'file'
  doc_type       text,            -- 'jd' | 'intake_notes' | 'cv' | 'note' | 'output' | 'other'
  source         text,            -- 'upload' | 'pasted' | 'workflow'
  filename       text,
  storage_path   text,            -- null for pasted docs
  extracted_text text,
  is_active      boolean default true,
  created_by     text,            -- Clerk user id
  created_at     timestamptz default now()
);
create index documents_scope_idx on documents (scope_type, scope_id);
create index documents_workspace_idx on documents (workspace_id);

-- Execution log
create table workflow_runs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects not null,
  workspace_workflow_id uuid references workspace_workflows not null,
  status                text,        -- running | succeeded | failed
  input_doc_ids         uuid[],
  output_doc_id         uuid references documents,
  rendered_prompt       text,
  context_notes         jsonb,       -- truncation/injection notes, visible in run log
  error_message         text,
  provider              text,
  model                 text,
  fallback_used         boolean default false,
  model_response        text,
  input_tokens          int,
  output_tokens         int,
  cache_read_tokens     int,
  cost_usd              numeric(10,6),
  created_by            text,
  created_at            timestamptz default now()
);
create index workflow_runs_project_idx on workflow_runs (project_id);

-- Storage bucket for uploaded documents (private)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
