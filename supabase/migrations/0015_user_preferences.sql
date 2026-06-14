-- Per-user personal preferences (Settings > Personal). Keyed by
-- (workspace_id, user_id) so each member has their own row per workspace.
-- user_id is the Clerk user id, or the email in single-workspace mode.
--
-- first_name / last_name mirror Clerk (the source of truth in Clerk mode) so
-- agent runs can read the sender's name without a Clerk round-trip. The email_*
-- fields feed the Outreach Writer and are injected into every agent run as
-- higher-priority context than the knowledge base.
create table user_preferences (
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  user_id          text not null,
  first_name       text,
  last_name        text,
  company_name     text,
  company_website  text,
  email_signature  text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Service-role-only access, matching every other table (see 0003_enable_rls).
alter table user_preferences enable row level security;
