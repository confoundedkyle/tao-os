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
import { importWorkflowAction } from "@/lib/actions/workflows";
import { config } from "@/lib/config";
import { deriveWorkflowGraph } from "@/lib/workflow-graph";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { WorkflowPreviewDialog } from "@/components/workflow-preview-dialog";
import { AgentLibrary } from "@/components/agent-library";
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

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

// Per-workflow icon so every card is visually distinct. Falls back to the
// category icon for any workflow not listed here.
const WORKFLOW_ICONS: Record<string, IconComponent> = {
  "intake-to-jd-builder": IconDocumentCheck,
  "job-requirement-analysis": IconWorkflowNodes,
  "candidate-scorecard-rubric": IconCheck,
  "sourcing-strategy-map": IconMagnet,
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
  // Only an ACTIVE copy counts as "imported". If the workspace's only copy is
  // archived, the library shows "Import" again so the user can re-import; the
  // archived copy stays in the Agents overview's Archived section.
  const importedAgentIds = new Set(
    importedAgents
      .filter((a) => !a.archived_at)
      .map((a) => a.library_agent_id)
      .filter(Boolean),
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
          importedAgentIds={[...importedAgentIds].filter(
            (id): id is string => !!id,
          )}
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
