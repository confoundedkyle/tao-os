import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  getProject,
  listConnections,
  listDocuments,
  listProviders,
  listWorkspaceAgents,
  listWorkspaceWorkflows,
} from "@/lib/queries";
import { checkBudgets } from "@/lib/budgets";
import { env } from "@/lib/env";
import { preflightWorkflow } from "@/lib/readiness";
import {
  agentDocSpec,
  DOC_TYPE_LABELS,
  deriveWorkflowGraph,
} from "@/lib/workflow-graph";
import { agentRequirements, connectedProvidersFrom } from "@/lib/run-items";
import { AgentRunPanel } from "@/components/agent-run-panel";
import { CombinedRunHistory } from "@/components/combined-run-history";
import { RunPanel, type RunPanelWorkflow } from "@/components/run-panel";
import { Card } from "@/components/ui";

export default async function RunItemPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string; itemId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId, itemId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [workflows, agents] = await Promise.all([
    listWorkspaceWorkflows(session.workspaceId),
    listWorkspaceAgents(session.workspaceId),
  ]);
  const workflow = workflows.find((w) => w.id === itemId && !w.archived_at);
  const agent = agents.find((a) => a.id === itemId && !a.archived_at);
  if (!workflow && !agent) notFound();

  const documentsHref = `/clients/${clientId}/projects/${projectId}/documents`;

  // --- Workflow item: prompt-template run via RunPanel ---
  if (workflow) {
    const [docs, providers, model, connections] = await Promise.all([
      listDocuments(session.workspaceId, "project", projectId, "file"),
      listProviders(session.workspaceId),
      getPrimaryRunModel(session.workspaceId),
      listConnections(session.workspaceId),
    ]);
    const activeConnections = connections.filter((c) => c.status !== "error");

    const preflight = preflightWorkflow(
      workflow.library?.input_spec ?? null,
      docs,
    );
    const panelWorkflow: RunPanelWorkflow = {
      id: workflow.id,
      name: workflow.name,
      ready: preflight.ready,
      missing: preflight.missing,
      needsInputPicker: preflight.needsInputPicker,
      inputDocTypes: preflight.inputDocTypes,
      graph: deriveWorkflowGraph({
        name: workflow.name,
        promptTemplate: workflow.prompt_template,
        inputSpec: workflow.library?.input_spec ?? null,
        outputSpec: workflow.library?.output_spec ?? null,
        model,
        connections: activeConnections,
      }),
    };

    let blockedMessage: string | null = null;
    const spendGate = await checkBudgets(session.workspace, "byo");
    const hasByoProvider = providers.some(
      (p) => p.provider !== "calyflow" && p.api_key_cipher,
    );
    const platformAvailable =
      env.platformProviderEnabled &&
      providers.some((p) => p.provider === "calyflow");
    if (project.status !== "active") {
      blockedMessage = "This project is archived";
    } else if (spendGate.blocked) {
      blockedMessage = spendGate.message;
    } else if (!hasByoProvider) {
      const platformGate = await checkBudgets(session.workspace, "calyflow");
      if (!platformAvailable) {
        blockedMessage =
          "No AI provider configured — add one in Settings → AI Providers";
      } else if (platformGate.blocked) {
        blockedMessage = platformGate.message;
      }
    }

    return (
      <div className="space-y-6">
        <RunPanel
          projectId={project.id}
          heading={`Run ${workflow.name} Agent`}
          workflows={[panelWorkflow]}
          inputCandidates={docs
            .filter((d) => d.is_active)
            .map((d) => ({
              id: d.id,
              filename: d.filename ?? "Untitled",
              docType: d.doc_type,
              source: d.source,
            }))}
          blockedMessage={blockedMessage}
          documentsHref={documentsHref}
        />
        <CombinedRunHistory
          workspaceId={session.workspaceId}
          projectId={project.id}
          filter={{ kind: "workflow", itemId: workflow.id }}
          title="Recent runs"
        />
      </div>
    );
  }

  // --- Agent item: tool-using run via AgentRunPanel ---
  const [connections, model, agentDocs] = await Promise.all([
    listConnections(session.workspaceId),
    getPrimaryRunModel(session.workspaceId),
    listDocuments(session.workspaceId, "project", projectId, "file"),
  ]);
  const connectedProviders = connectedProvidersFrom(connections);

  // Required documents that aren't present yet — block the run until added.
  const presentDocTypes = new Set<string>(
    agentDocs.filter((d) => d.is_active && d.doc_type).map((d) => d.doc_type!),
  );
  const missingDocs = (agentDocSpec(agent!.library?.slug)?.required ?? [])
    .filter((t) => !presentDocTypes.has(t))
    .map((t) => ({ docType: t, label: DOC_TYPE_LABELS[t] ?? t }));

  const agentLead =
    agent!.library?.og_description ??
    agent!.library?.description ??
    "Reads your knowledge base, queries connected data sources, and writes a result back into this project.";

  return (
    <div className="space-y-6">
      <Card featured>
        <h2 className="mb-1 text-xl font-semibold">Run {agent!.name} Agent</h2>
        <p className="mb-4 text-sm text-navy-800/55">{agentLead}</p>
        <AgentRunPanel
          projectId={project.id}
          agents={[
            {
              id: agent!.id,
              name: agent!.name,
              slug: agent!.library?.slug,
              description: agent!.library?.description,
              instructions: agent!.instructions,
              requirements: agentRequirements(
                agent!.allowed_tools ?? [],
                connectedProviders,
              ),
            },
          ]}
          model={model}
          connectorsHref="/settings/connectors"
          documentsHref={documentsHref}
          missingDocs={missingDocs}
          archived={project.status !== "active"}
        />
      </Card>
      <CombinedRunHistory
        workspaceId={session.workspaceId}
        projectId={project.id}
        filter={{ kind: "agent", itemId: agent!.id }}
        title="Recent runs"
      />
    </div>
  );
}
