import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  getWorkspaceWorkflow,
  listConnections,
} from "@/lib/queries";
import { deriveWorkflowGraph } from "@/lib/workflow-graph";
import {
  archiveWorkflowAction,
  updateWorkflowAction,
  upgradeWorkflowAction,
  deleteWorkflowAction,
  restoreWorkflowAction,
} from "@/lib/actions/workflows";
import { Button, Card, Chip, Field, inputClass, PageHeader } from "@/components/ui";
import { WorkflowCanvas } from "@/components/workflow-canvas";

export default async function WorkflowEditPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { workflowId } = await params;
  const workflow = await getWorkspaceWorkflow(session.workspaceId, workflowId);
  if (!workflow) notFound();

  const [model, connections] = await Promise.all([
    getPrimaryRunModel(session.workspaceId),
    listConnections(session.workspaceId),
  ]);
  const graph = deriveWorkflowGraph({
    name: workflow.name,
    promptTemplate: workflow.prompt_template,
    inputSpec: workflow.library?.input_spec ?? null,
    outputSpec: workflow.library?.output_spec ?? null,
    model,
    connections: connections.filter((c) => c.status !== "error"),
  });

  const upgradeAvailable =
    workflow.library && workflow.imported_version != null
      ? workflow.library.version > workflow.imported_version
      : false;

  return (
    <>
      <PageHeader
        title={workflow.name}
        description={workflow.library?.description}
        action={
          upgradeAvailable ? (
            <form action={upgradeWorkflowAction.bind(null, workflow.id)}>
              <Chip tone="amber" className="mr-3">
                v{workflow.library!.version} available
              </Chip>
              <Button variant="smallSecondary" type="submit">
                Upgrade prompt to v{workflow.library!.version}
              </Button>
            </form>
          ) : workflow.archived_at ? (
            <Chip tone="amber">Archived</Chip>
          ) : (
            <Chip tone="mint">
              v{workflow.imported_version ?? "custom"} · up to date
            </Chip>
          )
        }
      />
      <Card className="mb-6">
        <h2 className="mb-1 text-xl font-semibold">How this workflow runs</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          What the AI pulls in, and what comes out the other side.
        </p>
        <WorkflowCanvas graph={graph} />
      </Card>
      <Card>
        <form action={updateWorkflowAction} className="space-y-5">
          <input type="hidden" name="workflowId" value={workflow.id} />
          <Field label="Name">
            <input
              name="name"
              defaultValue={workflow.name}
              required
              className={inputClass}
            />
          </Field>
          <Field
            label="Prompt template"
            hint={
              <>
                Placeholders injected at run time:{" "}
                <span className="font-mono text-[12px]">
                  {"{{workspace_kb}} {{client_kb}} {{client_files}} {{project_files}} {{input_document}}"}
                </span>
              </>
            }
          >
            <textarea
              name="promptTemplate"
              defaultValue={workflow.prompt_template}
              rows={24}
              className={`${inputClass} font-mono text-[13px] leading-relaxed`}
            />
          </Field>
          <div className="flex items-center justify-between">
            <Button type="submit">Save changes</Button>
          </div>
        </form>
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-navy-800/10 pt-4">
          {workflow.archived_at ? (
            <form action={restoreWorkflowAction.bind(null, workflow.id)}>
              <Button variant="smallSecondary" type="submit">
                Restore from archive
              </Button>
            </form>
          ) : (
            <form action={archiveWorkflowAction.bind(null, workflow.id)}>
              <Button variant="smallSecondary" type="submit">
                Archive
              </Button>
            </form>
          )}
          <form action={deleteWorkflowAction.bind(null, workflow.id)}>
            <Button variant="danger" type="submit">
              Remove from workspace
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}
