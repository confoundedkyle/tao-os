-- Activation milestone: the moment a workspace ran its first REAL (non-demo)
-- agent run successfully. Set once via a guarded conditional UPDATE in the run
-- route, so the `activated` analytics event fires exactly once and lifecycle
-- nudges can filter on `activated_at IS NULL`. Null = not yet activated.
alter table workspaces add column activated_at timestamptz;

-- Backfill: a workspace that already has a successful real (non-demo) agent run
-- is already activated — stamp it with that first run's time so the onboarding
-- guide and lifecycle nudges don't re-target existing active users.
update workspaces w
set activated_at = sub.first_at
from (
  select c.workspace_id, min(ar.created_at) as first_at
  from agent_runs ar
  join projects p on p.id = ar.project_id
  join clients c on c.id = p.client_id
  where ar.status = 'succeeded'
    and p.is_demo = false
    and c.is_demo = false
  group by c.workspace_id
) sub
where w.id = sub.workspace_id;
