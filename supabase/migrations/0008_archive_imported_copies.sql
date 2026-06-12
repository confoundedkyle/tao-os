-- Archive imported workflows/agents instead of deleting them: runs reference
-- both tables (no cascade), so a copy with run history must survive as a row
-- to keep the run log intact. Archived copies disappear from pickers and
-- lists but can be restored.
alter table workspace_workflows add column archived_at timestamptz;
alter table workspace_agents add column archived_at timestamptz;
