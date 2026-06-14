-- Where an agent belongs / is run from. "recruiting-project" agents appear in a
-- project's Agents tab; other contexts (e.g. "business-development") are
-- surfaced elsewhere and kept out of the project agent list.
alter table library_agents
  add column if not exists context text not null default 'recruiting-project';
