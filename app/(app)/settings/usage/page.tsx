import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { checkBudgets } from "@/lib/budgets";
import { listRecentAgentRuns, listRecentRuns } from "@/lib/queries";
import { env } from "@/lib/env";
import Link from "next/link";
import { ButtonLink, Card, Chip, Mono } from "@/components/ui";

interface RecentRow {
  id: string;
  kind: "workflow" | "agent";
  name: string;
  model: string | null;
  tokens: number;
  cost: number | null;
  status: string;
  createdAt: string;
  href: string | null;
}

function Meter({ fraction }: { fraction: number }) {
  const pct = Math.min(Math.round(fraction * 100), 100);
  const tone =
    pct >= 100 ? "bg-coral-400" : pct >= 80 ? "bg-amber-400" : "bg-mint-400";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-800/8">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function UsagePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [budget, workflowRuns, agentRuns] = await Promise.all([
    checkBudgets(session.workspace, "calyflow"),
    listRecentRuns(session.workspaceId, 20),
    listRecentAgentRuns(session.workspaceId, 20),
  ]);

  // Merge workflow + agent runs into one recency-sorted feed.
  const runs: RecentRow[] = [
    ...workflowRuns.map((r) => ({
      id: r.id,
      kind: "workflow" as const,
      name: r.workflow?.name ?? "—",
      model: r.model,
      tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      cost: r.cost_usd != null ? Number(r.cost_usd) : null,
      status: r.status,
      createdAt: r.created_at,
      href: `/runs/${r.id}`,
    })),
    ...agentRuns.map((r) => ({
      id: r.id,
      kind: "agent" as const,
      name: r.agent?.name ?? "Agent",
      model: r.model,
      tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      cost: r.cost_usd != null ? Number(r.cost_usd) : null,
      status: r.status,
      createdAt: r.created_at,
      // Agent runs have no detail page; deep-link to the saved output if any.
      href: r.output_doc_id ? `/docs/${r.output_doc_id}` : null,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  const creditFraction =
    budget.platformCreditUsd > 0
      ? budget.platformSpentUsd / budget.platformCreditUsd
      : 0;
  const limitFraction =
    budget.monthlyLimitUsd && budget.monthlyLimitUsd > 0
      ? budget.monthSpendUsd / budget.monthlyLimitUsd
      : null;

  return (
    <div className="grid max-w-3xl gap-6">
      {env.platformProviderEnabled && budget.platformCreditUsd > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Included AI credit</h2>
            <Mono>
              ${budget.platformSpentUsd.toFixed(2)} / $
              {budget.platformCreditUsd.toFixed(2)}
            </Mono>
          </div>
          <p className="mb-4 text-sm text-navy-800/55">
            One-time credit for runs on the Calyflow default model. Your own
            API keys are never capped — that&apos;s your spend, not ours.
          </p>
          <Meter fraction={creditFraction} />
          {creditFraction >= 1 && (
            <div className="mt-4 rounded-card border border-amber-400/40 bg-amber-400/10 p-4">
              <p className="mb-3 text-sm font-medium">
                You&apos;ve used your included AI credit. Add your own API key
                to continue free.
              </p>
              <ButtonLink href="/settings/providers" variant="small">
                Add your API key
              </ButtonLink>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold">This month</h2>
          <Mono>
            ${budget.monthSpendUsd.toFixed(2)}
            {budget.monthlyLimitUsd != null
              ? ` / $${Number(budget.monthlyLimitUsd).toFixed(2)} limit`
              : ""}
          </Mono>
        </div>
        <p className="mb-4 text-sm text-navy-800/55">
          All runs, all providers. Resets each calendar month.{" "}
          <Link
            href="/settings"
            className="font-medium text-mint-700 hover:underline"
          >
            {budget.monthlyLimitUsd != null
              ? "Change the limit in Settings →"
              : "Set a monthly limit in Settings →"}
          </Link>
        </p>
        {limitFraction !== null && <Meter fraction={limitFraction} />}
      </Card>

      <Card>
        <h2 className="mb-4 text-xl font-semibold">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-navy-800/45">No runs yet.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-navy-800/12 text-left text-navy-800/50">
                <th className="py-2 font-semibold">Run</th>
                <th className="py-2 font-semibold">Model</th>
                <th className="py-2 text-right font-semibold">Tokens</th>
                <th className="py-2 text-right font-semibold">Cost</th>
                <th className="py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={`${run.kind}-${run.id}`}
                  className="relative border-b border-navy-800/6 transition-colors hover:bg-cream-100"
                >
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Chip tone={run.kind === "agent" ? "sky" : "navy"}>
                        {run.kind === "agent" ? "Agent" : "Workflow"}
                      </Chip>
                      {run.href ? (
                        <Link
                          href={run.href}
                          className="font-medium hover:text-mint-700 before:absolute before:inset-0 before:content-['']"
                        >
                          {run.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{run.name}</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2">
                    <Mono className="!text-[12.5px]">{run.model ?? "—"}</Mono>
                  </td>
                  <td className="py-2 text-right">
                    <Mono className="!text-[12.5px]">
                      {run.tokens.toLocaleString()}
                    </Mono>
                  </td>
                  <td className="py-2 text-right">
                    <Mono className="!text-[12.5px]">
                      {run.cost != null ? `$${run.cost.toFixed(4)}` : "—"}
                    </Mono>
                  </td>
                  <td className="py-2 text-right">
                    <Chip
                      tone={
                        run.status === "succeeded"
                          ? "mint"
                          : run.status === "failed"
                            ? "coral"
                            : "sky"
                      }
                    >
                      {run.status}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
