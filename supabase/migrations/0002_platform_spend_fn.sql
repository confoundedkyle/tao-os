-- Atomic increment for the denormalized platform-credit counter.
-- SUM(workflow_runs.cost_usd WHERE provider='calyflow') stays the source of
-- truth; this counter is reconciled against it (SPEC §4).
create or replace function increment_platform_spent(
  p_workspace_id uuid,
  p_amount numeric
) returns void
language sql
as $$
  update workspaces
  set one_time_platform_credit_spent_usd =
        coalesce(one_time_platform_credit_spent_usd, 0) + p_amount
  where id = p_workspace_id;
$$;
