-- Per-workspace dismissal of the sidebar DEMO section. When true, the demo
-- client/project are hidden from this workspace and no longer provisioned or
-- synced. The rows are left in place (not deleted), so hiding is reversible.
alter table workspaces add column demo_hidden boolean not null default false;
