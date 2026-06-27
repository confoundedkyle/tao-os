import "server-only";
import { db } from "../db";

/** Cumulative USD spend across this project's shortlist runs. */
export async function shortlistSpentUsd(projectId: string): Promise<number> {
  const { data } = await db()
    .from("shortlist_runs")
    .select("cost_usd")
    .eq("project_id", projectId);
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { cost_usd: number | null }).cost_usd ?? 0),
    0,
  );
}

/** Cumulative connector credit spend for a project, keyed by provider slug (in
 *  each connector's native unit). Drives the Shortlist "spent of cap" rows and
 *  the live per-connector cap passed to the sourcing agent. */
export async function connectorSpendByProvider(
  projectId: string,
): Promise<Record<string, number>> {
  const { data } = await db()
    .from("connector_credit_usage")
    .select("provider, credits")
    .eq("project_id", projectId);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { provider: string; credits: number | null }[]) {
    out[r.provider] = (out[r.provider] ?? 0) + Number(r.credits ?? 0);
  }
  return out;
}

/** Record one metered tool call's spend, associated with the search run that
 *  spent it (shortlistRunId null when the caller isn't a shortlist run). */
export async function recordConnectorCreditUsage(args: {
  workspaceId: string;
  projectId: string;
  shortlistRunId: string | null;
  provider: string;
  credits: number;
  detail?: unknown;
}): Promise<void> {
  if (!(args.credits > 0)) return;
  await db()
    .from("connector_credit_usage")
    .insert({
      workspace_id: args.workspaceId,
      project_id: args.projectId,
      shortlist_run_id: args.shortlistRunId,
      provider: args.provider,
      credits: args.credits,
      detail: args.detail ?? null,
    })
    .then(undefined, () => {
      /* best-effort: never fail the run on a usage-log write */
    });
}
