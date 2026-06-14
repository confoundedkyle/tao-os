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
import { config } from "@/lib/config";
import { deriveAgentGraph, deriveWorkflowGraph } from "@/lib/workflow-graph";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { WorkflowPreviewDialog } from "@/components/workflow-preview-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { AgentContextBadge } from "@/components/agent-context-badge";
import {
  IconAiSpark,
  IconCheck,
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

/** First `n` words of a string, with an ellipsis if it was longer. */
function firstWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : `${words.slice(0, n).join(" ")}…`;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { category, tab } = await searchParams;
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
  // Workflows have been folded into agents; the workflows tab only shows if a
  // (future, complex) library workflow still exists. Agents are the default.
  const hasWorkflows = library.length > 0;
  const agentsTab = tab === "agents" || !hasWorkflows;
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
        title="Agent library"
        description="Curated recruiting agents. Import the ones you want — your copy is yours to rename and tweak."
        wide
      />

      {hasWorkflows && (
        <div className="mb-6 flex items-center gap-2 border-b border-navy-800/10">
          {[
            { href: "/library?tab=agents", label: "Agents", active: agentsTab },
            { href: "/library", label: "Workflows", active: !agentsTab },
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
      )}

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

      <p className="mt-10 text-center text-sm text-navy-800/40">
        Need another agent?{" "}
        <a
          href={`mailto:${config.contactEmail}`}
          className="font-semibold text-navy-800/55 hover:text-mint-700"
        >
          Let us know at {config.contactEmail}
        </a>
      </p>
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

  if (agents.length === 0) {
    return (
      <p className="text-navy-800/55">
        No agents in the library yet — run the seed script (
        <span className="font-mono text-[13px]">npx tsx scripts/seed.ts</span>
        ) to load them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {agents.map((agent) => {
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
          <Card key={agent.id} className="p-5">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-lg font-semibold">{agent.name}</h3>
                  <AgentContextBadge context={agent.context} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-navy-800/45">
                    <WorkflowPreviewDialog
                      name={agent.name}
                      description={agent.description}
                      graph={deriveAgentGraph({
                        name: agent.name,
                        connectors: slots,
                        model,
                        slug: agent.slug,
                        description: agent.description,
                        instructions: agent.instructions,
                      })}
                    />
                    <span>
                      <span className="font-mono">v{agent.version}</span> · by{" "}
                      {AUTHOR}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-navy-800/55">
                  {firstWords(agent.description, 40)}
                </p>
                {slots.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-navy-800/40">Needs:</span>
                    {slots.map((slot) => {
                      const names = slot.connectedNames.map(connectorLabel);
                      const connected = names.length > 0;
                      return (
                        <Link
                          key={slot.category}
                          href={`/settings/connectors?category=${slot.category}`}
                          title={
                            connected
                              ? `Connected: ${names.join(", ")} — view connectors`
                              : `View ${slot.categoryLabel} connectors`
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition hover:brightness-95 hover:underline ${
                            connected
                              ? "bg-mint-400/20 text-mint-700"
                              : "bg-amber-400/15 text-navy-800/65"
                          }`}
                        >
                          {connected ? "✓" : "○"} any {slot.categoryLabel}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-navy-800/40">Uses:</span>
                  <PromptDialog name={agent.name} prompt={agent.instructions} />
                </div>
              </div>
              <div className="shrink-0">
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
            </div>
          </Card>
        );
      })}
    </div>
  );
}
