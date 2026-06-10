import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createWorkflowAction } from "@/lib/actions/workflows";
import { Button, Card, Field, inputClass, PageHeader } from "@/components/ui";

const STARTER_TEMPLATE = `You are an expert recruiter assistant.

Workspace context:
{{workspace_kb}}

Client context:
{{client_kb}}

Project files:
{{project_files}}

Candidate / input document:
{{input_document}}

---

Write your task instructions here.`;

export default async function NewWorkflowPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link href="/workflows" className="hover:text-mint-700">
          Workflows
        </Link>{" "}
        / New
      </div>
      <PageHeader
        title="Create workflow"
        description="Write your own prompt from scratch. You can edit it anytime."
      />
      <Card>
        <form action={createWorkflowAction} className="space-y-5">
          <Field label="Name">
            <input
              name="name"
              placeholder="e.g. Reference check summary"
              required
              autoFocus
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
              defaultValue={STARTER_TEMPLATE}
              rows={24}
              className={`${inputClass} font-mono text-[13px] leading-relaxed`}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit">Create workflow</Button>
            <Link
              href="/workflows"
              className="text-sm font-medium text-navy-800/55 hover:text-navy-900"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
