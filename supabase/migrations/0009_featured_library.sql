-- Featured flag for the public marketing site: featured library items are
-- highlighted on the homepage, the rest live on a dedicated catalog page.
alter table library_workflows add column featured boolean default false;
alter table library_agents add column featured boolean default false;
