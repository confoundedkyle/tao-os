-- Let users archive unhelpful agent runs. Soft-hide only: an archived run drops
-- out of the "recent" list and renders muted/condensed below the main history,
-- but stays visible to everyone and still counts toward cost/activity tracking,
-- so archiving never loses history.
alter table agent_runs add column archived_at timestamptz;
