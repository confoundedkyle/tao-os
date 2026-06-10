-- Defense-in-depth (SPEC §9): the app uses the service-role key exclusively
-- (bypasses RLS); enabling RLS with no policies blocks the anon/authenticated
-- PostgREST roles entirely. Clerk-integrated policies can be layered later.
alter table workspaces enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table library_workflows enable row level security;
alter table workspace_workflows enable row level security;
alter table workspace_ai_providers enable row level security;
alter table model_catalog enable row level security;
alter table documents enable row level security;
alter table workflow_runs enable row level security;
