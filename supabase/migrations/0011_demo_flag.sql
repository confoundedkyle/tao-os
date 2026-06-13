-- Demo onboarding: a per-workspace hidden client + project backs the /demo
-- page's CV Screener run. Flag them so they stay out of the normal clients /
-- projects lists (sidebar, pickers) while still being real, runnable rows.
alter table clients  add column is_demo boolean not null default false;
alter table projects add column is_demo boolean not null default false;
