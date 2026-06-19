-- The per-user Demo project is instantiated from a shared, version-controlled
-- template (data/demo/*). `template_version` records which template version a
-- demo project was last synced to, so ensureDemoProject() can re-sync its docs
-- when the template (and its TEMPLATE_VERSION in lib/demo.ts) is bumped.
-- Null on every real project; only the demo project ever carries a value.
alter table projects add column template_version int;
