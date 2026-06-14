-- Short, in-app task summary for an agent — distinct from og_description (which
-- is social/marketing copy starting "Use this free Calyflow agent to ...").
-- The agent run page shows this one-liner under the title.
alter table library_agents add column if not exists summary text;
