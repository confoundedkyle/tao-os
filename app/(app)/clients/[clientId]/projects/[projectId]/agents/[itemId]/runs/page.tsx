import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getProject,
  listAgentRuns,
  listWorkspaceAgents,
  listWorkspaceMemberNames,
} from "@/lib/queries";
import { AgentRunsList, type AgentRunRow } from "@/components/agent-runs-list";

export default async function AgentRunsPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string; itemId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId, itemId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [agents, allRuns, names] = await Promise.all([
    listWorkspaceAgents(session.workspaceId),
    listAgentRuns(session.workspaceId, projectId),
    listWorkspaceMemberNames(session.workspaceId),
  ]);
  const agent = agents.find((a) => a.id === itemId);
  if (!agent) notFound();

  const runnerName = (id: string | null) =>
    id ? (names[id] ?? (id.includes("@") ? id : null)) : null;

  const rows: AgentRunRow[] = allRuns
    .filter((r) => r.workspace_agent_id === itemId)
    .map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      name: r.agent?.name ?? agent.name,
      task: r.task,
      status: r.status,
      model: r.model,
      costUsd: r.cost_usd,
      createdAt: r.created_at,
      runner: runnerName(r.created_by),
      archived: r.archived_at != null,
    }));

  const agentHref = `/clients/${clientId}/projects/${projectId}/agents/${itemId}`;

  return (
    <div className="space-y-3">
      <Link
        href={agentHref}
        className="inline-block text-sm font-semibold text-mint-700 hover:underline"
      >
        ← Back to {agent.name}
      </Link>
      <p className="text-sm text-navy-800/55">
        Every run of this agent in this project — including runs by other
        teammates.
      </p>
      <AgentRunsList
        title={`All runs · ${agent.name}`}
        rows={rows}
        agentHref={agentHref}
      />
    </div>
  );
}
