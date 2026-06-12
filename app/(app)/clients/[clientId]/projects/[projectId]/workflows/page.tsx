import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  getProject,
  listConnections,
  listDocuments,
  listProviders,
  listRuns,
  listWorkspaceWorkflows,
} from "@/lib/queries";
import { checkBudgets } from "@/lib/budgets";
import { env } from "@/lib/env";
import { preflightWorkflow } from "@/lib/readiness";
import { deriveWorkflowGraph } from "@/lib/workflow-graph";
import { DocList } from "@/components/doc-list";
import { RunPanel, type RunPanelWorkflow } from "@/components/run-panel";
import { ButtonLink, Card, Chip, Mono } from "@/components/ui";

export default async function ProjectWorkflowsPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [docs, allWorkflows, runs, providers, model, connections] =
    await Promise.all([
      listDocuments(session.workspaceId, "project", projectId, "file"),
      listWorkspaceWorkflows(session.workspaceId),
      listRuns(session.workspaceId, projectId),
      listProviders(session.workspaceId),
      getPrimaryRunModel(session.workspaceId),
      listConnections(session.workspaceId),
    ]);
  const workflows = allWorkflows.filter((wf) => !wf.archived_at);
  const activeConnections = connections.filter((c) => c.status !== "error");

  const panelWorkflows: RunPanelWorkflow[] = workflows.map((wf) => {
    const preflight = preflightWorkflow(wf.library?.input_spec ?? null, docs);
    return {
      id: wf.id,
      name: wf.name,
      ready: preflight.ready,
      missing: preflight.missing,
      needsInputPicker: preflight.needsInputPicker,
      inputDocTypes: preflight.inputDocTypes,
      graph: deriveWorkflowGraph({
        name: wf.name,
        promptTemplate: wf.prompt_template,
        inputSpec: wf.library?.input_spec ?? null,
        outputSpec: wf.library?.output_spec ?? null,
        model,
        connections: activeConnections,
      }),
    };
  });

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

  const outputDocs = docs
    .filter((d) => d.doc_type === "output")
    .sort((a, b) => b.created_at.localeCompare(a.created_at)); // newest first

  return (
    <div className="space-y-6">
      <Card featured>
        <h2 className="mb-4 text-xl font-semibold">Run a workflow</h2>
        {workflows.length === 0 ? (
          <p className="text-navy-800/55">
            No workflows imported yet.{" "}
            <ButtonLink href="/library" variant="small" className="ml-2">
              Browse the library
            </ButtonLink>
          </p>
        ) : (
          <RunPanel
            projectId={project.id}
            workflows={panelWorkflows}
            inputCandidates={docs
              .filter((d) => d.is_active)
              .map((d) => ({
                id: d.id,
                filename: d.filename ?? "Untitled",
                docType: d.doc_type,
                source: d.source,
              }))}
            blockedMessage={blockedMessage}
            adminHref={`/clients/${clientId}/projects/${projectId}/admin`}
          />
        )}
      </Card>

      {outputDocs.length > 0 && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Output documents</h2>
          <DocList docs={outputDocs} />
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-xl font-semibold">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-navy-800/45">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-navy-800/8">
            {runs.map((run) => (
              <li key={run.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/runs/${run.id}`}
                    className="min-w-0 truncate font-medium hover:text-mint-700"
                  >
                    {run.workflow?.name ?? "Workflow"}
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    {run.fallback_used && (
                      <Chip tone="amber">fallback</Chip>
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
                  {run.cost_usd != null
                    ? `$${Number(run.cost_usd).toFixed(4)}`
                    : "—"}
                </Mono>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
