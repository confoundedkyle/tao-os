// Pure budget math for the Shortlist (no server-only imports, so it's unit
// testable). The budget is set in USD — the same unit AI run costs are tracked
// in — so there's no currency conversion.

/** Default project-level sourcing budget (USD) when none is set in Project
 *  Settings — sourcing always runs under a cap, defaulting to this. */
export const DEFAULT_PROJECT_BUDGET_USD = 10;

/** The effective project cap: the stored value, or the default when unset. */
export function effectiveProjectBudgetUsd(stored: number | null): number {
  return stored != null && stored > 0 ? stored : DEFAULT_PROJECT_BUDGET_USD;
}

/** Per-session defaults when the recruiter leaves a session's goal/budget blank:
 *  aim for a few qualified candidates within a small budget. */
export const DEFAULT_SESSION_GOAL = 5;
export const DEFAULT_SESSION_BUDGET_USD = 3;

/** The effective session goal: the stored value, or the default when unset. */
export function effectiveSessionGoal(stored: number | null): number {
  return stored != null && stored > 0 ? stored : DEFAULT_SESSION_GOAL;
}

/** The effective session budget: the stored value, or the default when unset. */
export function effectiveSessionBudgetUsd(stored: number | null): number {
  return stored != null && stored > 0 ? stored : DEFAULT_SESSION_BUDGET_USD;
}

/** Whether cumulative USD spend has reached the USD budget. A null/zero/negative
 *  budget means "no budget set" → never reached. */
export function budgetReached(
  spentUsd: number,
  budgetUsd: number | null,
): boolean {
  if (budgetUsd == null || budgetUsd <= 0) return false;
  return spentUsd >= budgetUsd;
}
