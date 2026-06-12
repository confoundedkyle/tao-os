import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  listConnections,
  listLibraryAgents,
  listLibraryWorkflows,
  listWorkspaceAgents,
  listWorkspaceWorkflows,
} from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  connectorLabel,
  connectorsForCategory,
  requiredConnectorCategories,
} from "@/lib/connectors";
import { importWorkflowAction } from "@/lib/actions/workflows";
import { importAgentAction } from "@/lib/actions/agents";
import { deriveAgentGraph, deriveWorkflowGraph } from "@/lib/workflow-graph";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { WorkflowPreviewDialog } from "@/components/workflow-preview-dialog";
import {
  IconAiSpark,
  IconCheck,
  IconClientsBuilding,
  IconDocumentCheck,
  IconEnvelope,
  IconMagnet,
  IconMegaphone,
  IconRocket,
  IconScorecard,
  IconWorkflowNodes,
} from "@/components/icons";
import type { Connection } from "@/lib/types";

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

// Per-workflow icon so every card is visually distinct. Falls back to the
// category icon for any workflow not listed here.
const WORKFLOW_ICONS: Record<string, IconComponent> = {
  "intake-to-jd-builder": IconDocumentCheck,
  "job-requirement-analysis": IconWorkflowNodes,
  "candidate-icp-builder": IconCheck,
  "sourcing-map": IconMagnet,
  "job-selling-pitch": IconAiSpark,
  "outreach-writer": IconEnvelope,
  "cv-screener": IconScorecard,
  "submission-pack": IconRocket,
  "candidate-marketing-profile": IconMegaphone,
};

const AGENT_ICONS: Record<string, IconComponent> = {
  "sourcing-shortlist-ats": IconMagnet,
  "sourcing-shortlist-sheet": IconScorecard,
  "client-prospecting-research": IconClientsBuilding,
  "candidate-outreach-email": IconEnvelope,
};

const CATEGORY_ICONS: Record<string, IconComponent> = {
  intake: IconDocumentCheck,
  icp: IconCheck,
  sourcing: IconMagnet,
  selling: IconAiSpark,
  marketing: IconMegaphone,
  outreach: IconEnvelope,
  screening: IconScorecard,
  submission: IconRocket,
};

const CATEGORIES = [
  "intake",
  "icp",
  "sourcing",
  "selling",
  "marketing",
  "outreach",
  "screening",
  "submission",
] as const;

const AUTHOR = "Michal Juhas";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { category, tab } = await searchParams;
  const agentsTab = tab === "agents";
  const active = (CATEGORIES as readonly string[]).includes(category ?? "")
    ? category
    : undefined;
  const [
    library,
    imported,
    libraryAgents,
    importedAgents,
    model,
    connections,
  ] = await Promise.all([
    listLibraryWorkflows(),
    listWorkspaceWorkflows(session.workspaceId),
    listLibraryAgents(),
    listWorkspaceAgents(session.workspaceId),
    getPrimaryRunModel(session.workspaceId),
    listConnections(session.workspaceId),
  ]);
  const activeConnections = connections.filter((c) => c.status !== "error");
  const importedIds = new Set(
    imported.map((w) => w.library_workflow_id).filter(Boolean),
  );
  const importedAgentIds = new Set(
    importedAgents.map((a) => a.library_agent_id).filter(Boolean),
  );
  const shown = active
    ? library.filter((wf) => wf.category === active)
    : library;

  return (
    <>
      <PageHeader
        title="Library"
        description="Curated recruiting workflows and agents. Import the ones you want — your copy is yours to rename and tweak."
      />

      <div className="mb-6 flex items-center gap-2 border-b border-navy-800/10">
        {[
          { href: "/library", label: "Simple one-step workflows", active: !agentsTab },
          { href: "/library?tab=agents", label: "Advanced agents", active: agentsTab },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              t.active
                ? "border-mint-700 text-mint-700"
                : "border-transparent text-navy-800/55 hover:text-navy-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {agentsTab ? (
        <AgentLibrary
          agents={libraryAgents}
          importedAgentIds={importedAgentIds}
          connections={activeConnections}
          model={model}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {CATEGORIES.map((cat) => {
              const isActive = cat === active;
              return (
                <Link
                  key={cat}
                  // Clicking the active badge again clears the filter.
                  href={isActive ? "/library" : `/library?category=${cat}`}
                  className={`rounded-chip px-2.5 py-0.5 text-[13px] font-semibold transition ${
                    isActive
                      ? "bg-mint-400/22 text-mint-700"
                      : "bg-navy-800/8 text-navy-800/70 hover:bg-navy-800/15"
                  }`}
                >
                  {cat}
                </Link>
              );
            })}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {shown.map((wf) => {
              const Icon =
                WORKFLOW_ICONS[wf.slug] ??
                CATEGORY_ICONS[wf.category] ??
                IconDocumentCheck;
              const isImported = importedIds.has(wf.id);
              return (
                <Card key={wf.id} className="flex flex-col">
                  <div className="mb-3 flex items-start justify-between">
                    <Icon size={32} className="text-navy-800" />
                    <Chip tone="navy">{wf.category}</Chip>
                  </div>
                  <h3 className="text-xl font-semibold">{wf.name}</h3>
                  <p className="mb-3 mt-1 flex-1 text-[15px] text-navy-800/55">
                    {wf.description}
                  </p>
                  <div className="mb-4">
                    <WorkflowPreviewDialog
                      name={wf.name}
                      description={wf.description}
                      graph={deriveWorkflowGraph({
                        name: wf.name,
                        promptTemplate: wf.prompt_template,
                        inputSpec: wf.input_spec,
                        outputSpec: wf.output_spec,
                        model,
                        connections: activeConnections,
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-navy-800/45">
                      <span className="font-mono">v{wf.version}</span> · by {AUTHOR}
                    </span>
                    {isImported ? (
                      <Chip tone="mint">✓ Imported</Chip>
                    ) : (
                      <form action={importWorkflowAction.bind(null, wf.id)}>
                        <Button variant="small" type="submit">
                          Import
                        </Button>
                      </form>
                    )}
                  </div>
                </Card>
              );
            })}
            {library.length === 0 ? (
              <p className="text-navy-800/55">
                The library is empty — run the seed script (
                <span className="font-mono text-[13px]">
                  npx tsx scripts/seed.ts
                </span>
                ) to load the launch workflows.
              </p>
            ) : (
              shown.length === 0 && (
                <p className="text-navy-800/55">No workflows in this category yet.</p>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}

function AgentLibrary({
  agents,
  importedAgentIds,
  connections,
  model,
}: {
  agents: Awaited<ReturnType<typeof listLibraryAgents>>;
  importedAgentIds: Set<string | null>;
  connections: Connection[];
  model: { providerLabel: string; modelId: string } | null;
}) {
  const connectedProviders = new Set(connections.map((c) => c.provider));

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {agents.map((agent) => {
        const Icon = AGENT_ICONS[agent.slug] ?? IconAiSpark;
        const isImported = importedAgentIds.has(agent.id);
        const categories = requiredConnectorCategories(agent.allowed_tools ?? []);
        const slots = categories.map((cat) => {
          const connected = connectorsForCategory(cat).filter(
            (c) => c.provider && connectedProviders.has(c.provider),
          );
          return {
            category: cat,
            categoryLabel: CONNECTOR_CATEGORY_LABELS[cat],
            selectedProvider: connected[0]?.provider ?? null,
            selectedLabel: connected[0]?.name,
            connectedNames: connected.map((c) => c.provider!),
          };
        });
        return (
          <Card key={agent.id} className="flex flex-col">
            <div className="mb-3 flex items-start justify-between">
              <Icon size={32} className="text-navy-800" />
              <Chip tone="sky">agent</Chip>
            </div>
            <h3 className="text-xl font-semibold">{agent.name}</h3>
            <p className="mb-3 mt-1 flex-1 text-[15px] text-navy-800/55">
              {agent.description}
            </p>
            {slots.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-navy-800/40">Needs:</span>
                {slots.map((slot) => {
                  const names = slot.connectedNames.map(connectorLabel);
                  const connected = names.length > 0;
                  return (
                    <span
                      key={slot.category}
                      title={connected ? `Connected: ${names.join(", ")}` : undefined}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        connected
                          ? "bg-mint-400/20 text-mint-700"
                          : "bg-amber-400/15 text-navy-800/65"
                      }`}
                    >
                      {connected ? "✓" : "○"} any {slot.categoryLabel} connector
                      {connected &&
                        ` · ${names.length === 1 ? `${names[0]} connected` : `${names.length} connected`}`}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="mb-4">
              <WorkflowPreviewDialog
                name={agent.name}
                description={agent.description}
                graph={deriveAgentGraph({
                  name: agent.name,
                  connectors: slots,
                  model,
                })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-navy-800/45">
                <span className="font-mono">v{agent.version}</span> · by {AUTHOR}
              </span>
              {isImported ? (
                <Chip tone="mint">✓ Imported</Chip>
              ) : (
                <form action={importAgentAction.bind(null, agent.id)}>
                  <Button variant="small" type="submit">
                    Import
                  </Button>
                </form>
              )}
            </div>
          </Card>
        );
      })}
      {agents.length === 0 && (
        <p className="text-navy-800/55">
          No agents in the library yet — run the seed script (
          <span className="font-mono text-[13px]">npx tsx scripts/seed.ts</span>
          ) to load them.
        </p>
      )}
    </div>
  );
}
