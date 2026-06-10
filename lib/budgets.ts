import "server-only";
import { monthSpendUsd } from "./queries";
import type { Workspace } from "./types";

// Two gates with different owners (SPEC §10):
// 1. Platform credit — Calyflow's money, one-time, calyflow runs only.
// 2. Monthly spend limit — the user's money, all runs, set by the admin.

export interface BudgetStatus {
  blocked: boolean;
  reason: "platform_credit" | "spend_limit" | null;
  message: string | null;
  /** 0..1 of the closest gate, for the 80% soft-warning banner. */
  warningFraction: number | null;
  platformCreditUsd: number;
  platformSpentUsd: number;
  monthSpendUsd: number;
  monthlyLimitUsd: number | null;
}

export async function checkBudgets(
  workspace: Workspace,
  provider: string,
): Promise<BudgetStatus> {
  const platformCredit = Number(workspace.one_time_platform_credit_usd ?? 0);
  const platformSpent = Number(
    workspace.one_time_platform_credit_spent_usd ?? 0,
  );
  const monthlyLimit =
    workspace.monthly_spend_limit_usd != null
      ? Number(workspace.monthly_spend_limit_usd)
      : null;
  const monthSpend = await monthSpendUsd(workspace.id);

  const status: BudgetStatus = {
    blocked: false,
    reason: null,
    message: null,
    warningFraction: null,
    platformCreditUsd: platformCredit,
    platformSpentUsd: platformSpent,
    monthSpendUsd: monthSpend,
    monthlyLimitUsd: monthlyLimit,
  };

  const fractions: number[] = [];
  if (provider === "calyflow" && platformCredit > 0) {
    if (platformSpent >= platformCredit) {
      status.blocked = true;
      status.reason = "platform_credit";
      status.message =
        "You've used your included AI credit. Add your own API key to continue free.";
      return status;
    }
    fractions.push(platformSpent / platformCredit);
  }
  if (monthlyLimit != null && monthlyLimit > 0) {
    if (monthSpend >= monthlyLimit) {
      status.blocked = true;
      status.reason = "spend_limit";
      status.message =
        "This workspace hit its monthly spend limit. Runs resume next month, or the owner can raise the limit in Settings.";
      return status;
    }
    fractions.push(monthSpend / monthlyLimit);
  }

  const closest = fractions.length ? Math.max(...fractions) : null;
  if (closest !== null && closest >= 0.8) status.warningFraction = closest;
  return status;
}
