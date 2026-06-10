import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getProject,
  listDocuments,
  listProviders,
  listRuns,
  listWorkspaceWorkflows,
} from "@/lib/queries";
import { checkBudgets } from "@/lib/budgets";
import { env } from "@/lib/env";
import { setProjectStatusAction } from "@/lib/actions/clients";
import { activeOfType, preflightWorkflow } from "@/lib/readiness";
import { AddDocument } from "@/components/add-document";
import { DocList } from "@/components/doc-list";
import { RunPanel, type RunPanelWorkflow } from "@/components/run-panel";
import { Button, ButtonLink, Card, Chip, Mono, PageHeader } from "@/components/ui";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [docs, workflows, runs, providers] = await Promise.all([
    listDocuments(session.workspaceId, "project", projectId, "file"),
    listWorkspaceWorkflows(session.workspaceId),
    listRuns(session.workspaceId, projectId),
    listProviders(session.workspaceId),
  ]);

  // Readiness checklist — doubles as onboarding (SPEC §5).
  const hasJd = activeOfType(docs, "jd").length > 0;
  const hasIntake = activeOfType(docs, "intake_notes").length > 0;
  const cvCount = activeOfType(docs, "cv").length;

  const panelWorkflows: RunPanelWorkflow[] = workflows.map((wf) => {
    const preflight = preflightWorkflow(wf.library?.input_spec ?? null, docs);
    return {
      id: wf.id,
      name: wf.name,
      ready: preflight.ready,
      missing: preflight.missing,
      needsInputPicker: preflight.needsInputPicker,
      inputDocTypes: preflight.inputDocTypes,
    };
  });

  // Pre-run gates surfaced in the UI; the API enforces them again server-side.
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
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link href="/clients" className="hover:text-mint-700">
          Clients
        </Link>{" "}
        /{" "}
        <Link href={`/clients/${clientId}`} className="hover:text-mint-700">
          {project.client.name}
        </Link>
      </div>
      <PageHeader
        title={project.name}
        action={
          <form
            action={setProjectStatusAction.bind(
              null,
              project.id,
              project.status === "active" ? "archived" : "active",
            )}
          >
            <Button variant="smallSecondary" type="submit">
              {project.status === "active" ? "Archive project" : "Reactivate"}
            </Button>
          </form>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Chip tone={hasJd ? "mint" : "amber"}>
          {hasJd ? "✓" : "○"} Job description
        </Chip>
        <Chip tone={hasIntake ? "mint" : "navy"}>
          {hasIntake ? "✓" : "○"} Intake notes
        </Chip>
        <Chip tone={cvCount > 0 ? "mint" : "navy"}>
          {cvCount > 0 ? "✓" : "○"} CVs ({cvCount})
        </Chip>
      </div>

      <Card className="mb-6" featured>
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
              }))}
            blockedMessage={blockedMessage}
          />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-xl font-semibold">Project files</h2>
          <p className="mb-4 text-sm text-navy-800/55">
            JD, intake notes, CVs — pasting is always enough. A new JD
            automatically archives the old one.
          </p>
          <DocList docs={docs} />
          <div className="mt-4 border-t border-navy-800/8 pt-4">
            <AddDocument
              scopeType="project"
              scopeId={project.id}
              docTypes={["jd", "intake_notes", "cv", "other"]}
            />
          </div>
        </Card>

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
                      {run.fallback_used && <Chip tone="amber">fallback</Chip>}
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
    </>
  );
}
