import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getActiveAgentConversation,
  getPrimaryRunModel,
  getProject,
  listAgentRuns,
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
import { providersFromTools } from "@/lib/connectors";
import { AgentRunPanel } from "@/components/agent-run-panel";
import { CombinedRunHistory } from "@/components/combined-run-history";
import { RunHistoryMenu } from "@/components/run-history-menu";
import { RunPanel, type RunPanelWorkflow } from "@/components/run-panel";
import { Card } from "@/components/ui";

export default async function RunItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; projectId: string; itemId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId, itemId } = await params;
  const { c: conversationParam } = await searchParams;
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
  const [
    connections,
    model,
    agentDocs,
    conversation,
    workspaceKb,
    clientKb,
    allAgentRuns,
  ] = await Promise.all([
    listConnections(session.workspaceId),
    getPrimaryRunModel(session.workspaceId),
    listDocuments(session.workspaceId, "project", projectId, "file"),
    getActiveAgentConversation(
      session.workspaceId,
      projectId,
      agent!.id,
      conversationParam,
    ),
    listDocuments(session.workspaceId, "workspace", session.workspaceId, "kb"),
    listDocuments(session.workspaceId, "client", clientId, "kb"),
    listAgentRuns(session.workspaceId, projectId),
  ]);
  const connectedProviders = connectedProvidersFrom(connections);
  const workspaceKbAvailable = workspaceKb.some((d) => d.is_active);
  const clientKbAvailable = clientKb.some((d) => d.is_active);
  const agentRuns = allAgentRuns.filter(
    (r) => r.workspace_agent_id === agent!.id,
  );
  const agentRunHistory = agentRuns
    .filter((r) => r.archived_at == null)
    .map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      task: r.task,
      status: r.status,
      created_at: r.created_at,
    }));
  // Most-recent run's metrics, shown condensed at the top (refreshes when a run
  // finishes via the panel's router.refresh()).
  const latestRun = agentRuns[0] ?? null;
  const num = (n: number | null) => (n != null ? n.toLocaleString("en-US") : "—");
  const runStats = latestRun
    ? [
        {
          label: "Provider",
          value:
            latestRun.provider === "calyflow"
              ? "TAO OS default"
              : (latestRun.provider ?? "—"),
        },
        { label: "Model", value: latestRun.model ?? "—" },
        {
          label: "Tokens",
          value:
            latestRun.input_tokens != null
              ? `${num(latestRun.input_tokens)} in / ${num(latestRun.output_tokens)} out${
                  latestRun.cache_read_tokens
                    ? ` (${num(latestRun.cache_read_tokens)} cached)`
                    : ""
                }`
              : latestRun.status === "running"
                ? "running…"
                : "—",
        },
        {
          label: "Cost",
          value:
            latestRun.cost_usd != null
              ? `$${Number(latestRun.cost_usd).toFixed(6)}`
              : "—",
        },
        {
          label: "Started",
          value: new Date(latestRun.created_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        },
      ]
    : [];

  // Required documents that aren't present yet — block the run until added.
  const presentDocTypes = new Set<string>(
    agentDocs.filter((d) => d.is_active && d.doc_type).map((d) => d.doc_type!),
  );
  const missingDocs = (agentDocSpec(agent!.library?.slug)?.required ?? [])
    .filter((t) => !presentDocTypes.has(t))
    .map((t) => ({ docType: t, label: DOC_TYPE_LABELS[t] ?? t }));

  const agentLead =
    agent!.library?.summary ??
    agent!.library?.description ??
    "Reads your knowledge base, queries connected data sources, and writes a result back into this project.";

  return (
    <div className="space-y-4">
      <Card featured>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Run {agent!.name} Agent</h2>
            <p className="mt-0.5 text-sm text-navy-800/55">{agentLead}</p>
            {runStats.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] leading-tight text-navy-800/50">
                {runStats.map((s) => (
                  <span key={s.label}>
                    <span className="text-navy-800/35">{s.label}</span> {s.value}
                  </span>
                ))}
              </div>
            )}
          </div>
          <RunHistoryMenu
            runs={agentRunHistory}
            agentHref={`/clients/${clientId}/projects/${projectId}/agents/${itemId}`}
            allRunsHref={`/clients/${clientId}/projects/${projectId}/agents/${itemId}/runs`}
          />
        </div>
        <AgentRunPanel
          key={conversation?.conversationId ?? "new"}
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
              boundProviders: providersFromTools(agent!.allowed_tools ?? []),
            },
          ]}
          model={model}
          connectorsHref="/settings/connectors"
          documentsHref={documentsHref}
          missingDocs={missingDocs}
          archived={project.status !== "active"}
          initialConversation={conversation}
          workspaceKbAvailable={workspaceKbAvailable}
          clientKbAvailable={clientKbAvailable}
          connectedProviders={[...connectedProviders]}
          workspaceKbHref="/knowledge"
          clientKbHref={`/clients/${clientId}/knowledge`}
          skillHref={`/agents/${agent!.id}`}
          aiProviderHref="/settings/providers"
        />
      </Card>
    </div>
  );
}
