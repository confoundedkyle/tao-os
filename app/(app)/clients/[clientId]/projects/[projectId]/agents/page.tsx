import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getProject,
  listAgentRuns,
  listConnections,
  listLibraryAgents,
  listWorkspaceAgents,
} from "@/lib/queries";
import { importAgentAction } from "@/lib/actions/agents";
import { AgentRunPanel } from "@/components/agent-run-panel";
import { Button, ButtonLink, Card, Chip, Mono } from "@/components/ui";
import type { LibraryAgent } from "@/lib/types";

// Maps a tool name prefix to the connector it needs.
const TOOL_CONNECTOR_PREFIXES: Record<string, string> = {
  airtable_: "airtable",
  ashby_: "ashby",
  hunter_: "hunter",
};

const CONNECTOR_LABELS: Record<string, string> = {
  airtable: "Airtable",
  ashby: "Ashby",
  hunter: "Hunter.io",
};

function requiredConnectorsFor(tools: string[]): string[] {
  const needed = new Set<string>();
  for (const t of tools)
    for (const [prefix, provider] of Object.entries(TOOL_CONNECTOR_PREFIXES))
      if (t.startsWith(prefix)) needed.add(provider);
  return [...needed];
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

  const [agents, libraryAgents, runs, connections] = await Promise.all([
    listWorkspaceAgents(session.workspaceId),
    listLibraryAgents(),
    listAgentRuns(session.workspaceId, projectId),
    listConnections(session.workspaceId),
  ]);

  const importedSlugIds = new Set(
    agents.map((a) => a.library_agent_id).filter(Boolean),
  );
  const importable = libraryAgents.filter((la) => !importedSlugIds.has(la.id));
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
              requiredConnectors: requiredConnectorsFor(a.allowed_tools ?? []),
            }))}
            connectedProviders={[...connectedProviders]}
            connectorsHref="/settings/connectors"
            archived={project.status !== "active"}
          />
        ) : (
          <div className="space-y-5">
            <HowItWorks />
            {importable.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-800/70">
                  Pick an agent to import into this workspace
                </p>
                <ul className="space-y-2">
                  {importable.map((la) => (
                    <AgentImportCard
                      key={la.id}
                      agent={la}
                      connectedProviders={connectedProviders}
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-card border border-navy-800/12 bg-cream-100/60 p-4">
                <p className="text-sm font-medium text-navy-800/70">
                  No agents are available in your library yet.
                </p>
                <p className="mt-1 text-sm text-navy-800/55">
                  Agents are published to the library by your Calyflow admin.
                  Once one is available it&apos;ll show up here to import. In the
                  meantime you can{" "}
                  <Link
                    href="/settings/connectors"
                    className="font-semibold text-mint-700 hover:underline"
                  >
                    connect a data source
                  </Link>{" "}
                  so agents have something to read from.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {agents.length > 0 && importable.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Import more agents</h2>
          <ul className="space-y-2">
            {importable.map((la) => (
              <AgentImportCard
                key={la.id}
                agent={la}
                connectedProviders={connectedProviders}
              />
            ))}
          </ul>
        </Card>
      )}

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
      body: "Add a ready-made agent below — it comes preconfigured with the tools it needs.",
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

function AgentImportCard({
  agent,
  connectedProviders,
}: {
  agent: LibraryAgent;
  connectedProviders: Set<string>;
}) {
  const required = requiredConnectorsFor(agent.allowed_tools ?? []);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-navy-800/12 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold">{agent.name}</p>
        <p className="text-sm text-navy-800/55">{agent.description}</p>
        {required.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-navy-800/40">Needs:</span>
            {required.map((p) => {
              const connected = connectedProviders.has(p);
              return (
                <span
                  key={p}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    connected
                      ? "bg-mint-400/20 text-mint-700"
                      : "bg-amber-400/15 text-navy-800/65"
                  }`}
                >
                  {connected ? "✓" : "○"} {CONNECTOR_LABELS[p] ?? p}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <form
        action={importAgentAction.bind(null, agent.id)}
        className="shrink-0"
      >
        <Button variant="small" type="submit">
          Import
        </Button>
      </form>
    </li>
  );
}
