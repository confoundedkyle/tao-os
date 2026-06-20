-- GitHub Sourcer must not scrape GitHub pages: web_scrape hits GitHub's login
-- wall, returns junk, wastes steps, and fails runs. The library agent dropped
-- web_scrape in v3, but existing workspace copies are snapshots taken at import,
-- so they still carry it. Strip web_scrape from every GitHub Sourcer copy's
-- allowed_tools so the fix reaches everyone without a manual per-workspace
-- upgrade. web_search (used to find LinkedIn/X profiles) is intentionally kept.
-- Idempotent: the @> guard makes a re-run a no-op.
update workspace_agents wa
set allowed_tools = (
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  from jsonb_array_elements_text(wa.allowed_tools) as elem
  where elem <> 'web_scrape'
)
from library_agents la
where wa.library_agent_id = la.id
  and la.slug = 'github-sourcer'
  and wa.allowed_tools @> '["web_scrape"]'::jsonb;
