-- Activatable workspace modules: CRM, ATS, and Target Talent Pool. Activation
-- (workspace_modules) is admin-only and only controls sidebar visibility — the
-- entity tables below always exist and data is preserved across deactivation,
-- mirroring the workspace_connections model.

-- Per-workspace activation flags. One row per (workspace, module); absent row
-- is treated as inactive.
create table workspace_modules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  module_key    text not null,            -- 'crm' | 'ats' | 'talent_pool'
  is_active     boolean not null default false,
  activated_at  timestamptz,
  created_by    text,                      -- Clerk user id / email
  created_at    timestamptz default now(),
  unique (workspace_id, module_key)
);
create index workspace_modules_workspace_idx on workspace_modules (workspace_id);

-- CRM: accounts (companies) and leads (people connected to an account).
create table crm_accounts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  name          text not null,
  website       text,
  industry      text,
  status        text not null default 'active',  -- active | archived
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index crm_accounts_workspace_idx on crm_accounts (workspace_id);

create table crm_leads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  account_id    uuid references crm_accounts on delete set null,  -- lead -> account
  name          text not null,
  email         text,
  phone         text,
  title         text,
  status        text not null default 'new',  -- new | contacted | qualified | won | lost
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index crm_leads_workspace_idx on crm_leads (workspace_id);
create index crm_leads_account_idx on crm_leads (account_id);

-- ATS: candidates associated with an existing project (= role under a client).
create table ats_candidates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  project_id    uuid references projects on delete set null,  -- the role
  name          text not null,
  email         text,
  phone         text,
  status        text not null default 'sourced',  -- sourced|screening|interview|offer|hired|rejected
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index ats_candidates_workspace_idx on ats_candidates (workspace_id);
create index ats_candidates_project_idx on ats_candidates (project_id);

-- Target Talent Pool: niche prospects (not candidates). `notes` holds the
-- searchable free-text (skills/abilities/notes merged); `profile` is reserved
-- for later parsed CV/skills data. CVs are stored as `documents` rows scoped
-- with scope_type='prospect', doc_type='cv' (reusing existing Storage), not here.
create table talent_prospects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces not null,
  name          text not null,
  email         text,
  phone         text,
  country       text,
  city          text,
  linkedin_url  text,
  notes         text,
  profile       jsonb not null default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index talent_prospects_workspace_idx on talent_prospects (workspace_id);

-- Defense-in-depth: app uses the service-role key exclusively (see 0003).
alter table workspace_modules enable row level security;
alter table crm_accounts enable row level security;
alter table crm_leads enable row level security;
alter table ats_candidates enable row level security;
alter table talent_prospects enable row level security;
