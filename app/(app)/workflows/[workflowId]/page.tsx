import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getWorkspaceWorkflow } from "@/lib/queries";
import {
  updateWorkflowAction,
  upgradeWorkflowAction,
  deleteWorkflowAction,
} from "@/lib/actions/workflows";
import { Button, Card, Chip, Field, inputClass, PageHeader } from "@/components/ui";

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
          ) : (
            <Chip tone="mint">
              v{workflow.imported_version ?? "custom"} · up to date
            </Chip>
          )
        }
      />
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
        <form
          action={deleteWorkflowAction.bind(null, workflow.id)}
          className="mt-4 border-t border-navy-800/10 pt-4 text-right"
        >
          <Button variant="danger" type="submit">
            Remove from workspace
          </Button>
        </form>
      </Card>
    </>
  );
}
