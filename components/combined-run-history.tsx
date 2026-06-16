import Link from "next/link";
import {
  listAgentRuns,
  listRuns,
  listWorkspaceMemberNames,
} from "@/lib/queries";
import { Card, Chip, Mono } from "@/components/ui";

/** A workflow or agent run, normalized into a single feed row. */
interface FeedItem {
  kind: "workflow" | "agent";
  key: string;
  /** The id of the workflow/agent the run belongs to (for filtering). */
  itemId: string;
  name: string;
  status: "running" | "succeeded" | "failed";
  model: string | null;
  cost_usd: number | null;
  created_at: string;
  href: string | null;
  detail: string | null;
  runnerId: string | null;
}

/**
 * Combined "Run history" — workflow runs and agent runs merged into one
 * date-sorted feed. Agents and workflows execute the same kind of work, so they
 * share a single history. Pass `filter` to scope the feed to one item's runs.
 */
export async function CombinedRunHistory({
  workspaceId,
  projectId,
  filter,
  title = "Run history",
  showRunner = false,
}: {
  workspaceId: string;
  projectId: string;
  filter?: { kind: "workflow" | "agent"; itemId: string };
  title?: string;
  /** Show who ran each run (resolved from workspace member names). */
  showRunner?: boolean;
}) {
  const [runs, agentRuns, names] = await Promise.all([
    listRuns(workspaceId, projectId),
    listAgentRuns(workspaceId, projectId),
    showRunner
      ? listWorkspaceMemberNames(workspaceId)
      : Promise.resolve<Record<string, string>>({}),
  ]);

  const runnerName = (id: string | null): string | null => {
    if (!id) return null;
    if (names[id]) return names[id];
    return id.includes("@") ? id : null; // single-workspace: user_id is the email
  };

  const feed: FeedItem[] = [
    ...runs.map((r) => ({
      kind: "workflow" as const,
      key: `w:${r.id}`,
      itemId: r.workspace_workflow_id,
      name: r.workflow?.name ?? "Workflow",
      status: r.status,
      model: r.model,
      cost_usd: r.cost_usd,
      created_at: r.created_at,
      href: `/runs/${r.id}`,
      detail: null,
      runnerId: r.created_by,
    })),
    ...agentRuns.map((r) => ({
      kind: "agent" as const,
      key: `a:${r.id}`,
      itemId: r.workspace_agent_id,
      name: r.agent?.name ?? "Agent",
      status: r.status,
      model: r.model,
      cost_usd: r.cost_usd,
      created_at: r.created_at,
      href: `/agent-runs/${r.id}`,
      detail: r.task,
      runnerId: r.created_by,
    })),
  ]
    .filter((item) =>
      filter
        ? item.kind === filter.kind && item.itemId === filter.itemId
        : true,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {feed.length === 0 ? (
        <p className="text-sm text-navy-800/45">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-navy-800/8">
          {feed.map((item) => (
            <li key={item.key} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="min-w-0 truncate font-medium hover:text-mint-700"
                  >
                    {item.name}
                    {item.detail ? (
                      <span className="text-navy-800/45"> — {item.detail}</span>
                    ) : null}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-medium">
                    {item.name}
                    {item.detail ? (
                      <span className="text-navy-800/45"> — {item.detail}</span>
                    ) : null}
                  </span>
                )}
                <Chip
                  tone={
                    item.status === "succeeded"
                      ? "mint"
                      : item.status === "failed"
                        ? "coral"
                        : "sky"
                  }
                >
                  {item.status}
                </Chip>
              </div>
              <Mono>
                {new Date(item.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {item.model ?? "—"}
                {" · "}
                {item.cost_usd != null
                  ? `$${Number(item.cost_usd).toFixed(4)}`
                  : "—"}
                {showRunner && runnerName(item.runnerId)
                  ? ` · by ${runnerName(item.runnerId)}`
                  : ""}
              </Mono>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
