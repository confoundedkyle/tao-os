import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  getProject,
  listAgentRuns,
  listConnections,
  listWorkspaceAgents,
} from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  connectorsForCategory,
  requiredConnectorCategories,
} from "@/lib/connectors";
import {
  AgentRunPanel,
  type AgentConnectorRequirement,
} from "@/components/agent-run-panel";
import { ButtonLink, Card, Chip, Mono } from "@/components/ui";

/** The agent's required categories, each with the workspace's connected
 *  options of that category (the run panel's connector pickers). */
function requirementsFor(
  tools: string[],
  connectedProviders: Set<string>,
): AgentConnectorRequirement[] {
  return requiredConnectorCategories(tools).map((category) => ({
    category,
    label: CONNECTOR_CATEGORY_LABELS[category],
    options: connectorsForCategory(category)
      .filter((c) => c.provider && connectedProviders.has(c.provider))
      .map((c) => ({ provider: c.provider!, label: c.name })),
  }));
}

export default async function ProjectAgentsPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [allAgents, runs, connections, model] = await Promise.all([
    listWorkspaceAgents(session.workspaceId),
    listAgentRuns(session.workspaceId, projectId),
    listConnections(session.workspaceId),
    getPrimaryRunModel(session.workspaceId),
  ]);
  const agents = allAgents.filter((a) => !a.archived_at);

  const connectedProviders = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.provider),
  );

  return (
    <div className="space-y-6">
      <Card featured>
        <h2 className="mb-1 text-xl font-semibold">Run a data agent</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          Agents read your knowledge base, query connected data sources, and
          write a result back into this project.
        </p>
        {agents.length > 0 ? (
          <AgentRunPanel
            projectId={project.id}
            agents={agents.map((a) => ({
              id: a.id,
              name: a.name,
              requirements: requirementsFor(
                a.allowed_tools ?? [],
                connectedProviders,
              ),
            }))}
            model={model}
            connectorsHref="/settings/connectors"
            archived={project.status !== "active"}
          />
        ) : (
          <div className="space-y-5">
            <HowItWorks />
            <p className="text-sm text-navy-800/55">
              No agents imported yet.{" "}
              <ButtonLink
                href="/library?tab=agents"
                variant="small"
                className="ml-2"
              >
                Browse the library
              </ButtonLink>
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-xl font-semibold">Agent run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-navy-800/45">No agent runs yet.</p>
        ) : (
          <ul className="divide-y divide-navy-800/8">
            {runs.map((run) => (
              <li key={run.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {run.agent?.name ?? "Agent"}
                    {run.task ? (
                      <span className="text-navy-800/45"> — {run.task}</span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {run.output_doc_id && (
                      <Link
                        href={`/docs/${run.output_doc_id}`}
                        className="text-sm text-mint-700 hover:underline"
                      >
                        output
                      </Link>
                    )}
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
                  </div>
                </div>
                <Mono>
                  {new Date(run.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {run.model ?? "—"}
                  {" · "}
                  {(run.steps?.length ?? 0)} tool step
                  {(run.steps?.length ?? 0) === 1 ? "" : "s"}
                  {" · "}
                  {run.cost_usd != null
                    ? `$${Number(run.cost_usd).toFixed(4)}`
                    : "—"}
                </Mono>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-navy-800/45">
        Need a new data source?{" "}
        <ButtonLink href="/settings/connectors" variant="small">
          Manage connectors
        </ButtonLink>
      </p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Connect a data source",
      body: "Link Airtable, Ashby, or another source in Settings → Connectors.",
    },
    {
      n: "2",
      title: "Import an agent",
      body: "Add a ready-made agent from the Library — it comes preconfigured with the tools it needs.",
    },
    {
      n: "3",
      title: "Give it a task",
      body: "Describe what you want; the agent reads, queries, and saves a result here.",
    },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <li
          key={s.n}
          className="rounded-card border border-navy-800/10 bg-white p-4"
        >
          <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-mint-400/25 text-xs font-bold text-mint-700">
            {s.n}
          </span>
          <p className="text-sm font-semibold text-navy-800/85">{s.title}</p>
          <p className="mt-0.5 text-sm text-navy-800/55">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
