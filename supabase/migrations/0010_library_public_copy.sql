-- Public marketing copy for the library catalog site: a one-sentence social
-- description, a hero teaser paragraph, and a long markdown body (h2+).
alter table library_workflows add column og_description text;
alter table library_workflows add column lead text;
alter table library_workflows add column long_description text;
alter table library_agents add column og_description text;
alter table library_agents add column lead text;
alter table library_agents add column long_description text;
