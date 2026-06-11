-- Data-source connectors (Airtable spike). OAuth tokens stored encrypted at
-- rest (AES-256-GCM via APP_ENCRYPTION_KEY), mirroring workspace_ai_providers.
create table workspace_connections (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid references workspaces not null,
  provider             text not null,            -- 'airtable' | ...
  access_token_cipher  text,                      -- encrypted at rest
  refresh_token_cipher text,                      -- encrypted; rotates on refresh
  token_expires_at     timestamptz,
  account_label        text,                      -- display (e.g. Airtable user/email)
  scopes               text,                      -- space-separated granted scopes
  status               text default 'active',     -- active | error | revoked
  created_by           text,                      -- Clerk user id / email
  created_at           timestamptz default now(),
  unique (workspace_id, provider)
);
create index workspace_connections_workspace_idx on workspace_connections (workspace_id);

-- Defense-in-depth: app uses the service-role key exclusively (see 0003).
alter table workspace_connections enable row level security;
