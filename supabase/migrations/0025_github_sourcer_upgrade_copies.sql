-- Upgrade every GitHub Sourcer copy to the current library version (v3), so all
-- users get the fixed agent (no GitHub scraping) without clicking "Upgrade".
-- Copies the same fields the Upgrade action does (lib/actions/agents.ts):
-- instructions, allowed_tools, model, max_steps, imported_version. Leaves the
-- copy's name alone. Scoped to github-sourcer; only non-archived copies that are
-- behind the library version. The library is already reseeded to v3 by the
-- deploy's seed step on a prior deploy, so la.version = 3 here.
update workspace_agents wa
set instructions = la.instructions,
    allowed_tools = la.allowed_tools,
    model = la.model,
    max_steps = la.max_steps,
    imported_version = la.version
from library_agents la
where wa.library_agent_id = la.id
  and la.slug = 'github-sourcer'
  and wa.archived_at is null
  and (wa.imported_version is null or wa.imported_version < la.version);
