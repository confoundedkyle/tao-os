import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureDemoProject } from "@/lib/demo";
import {
  getDocument,
  getPrimaryRunModel,
  getWorkspaceWorkflow,
  listConnections,
} from "@/lib/queries";
import { deriveWorkflowGraph } from "@/lib/workflow-graph";
import { DemoExperience } from "@/components/demo/demo-experience";

export const metadata = { title: "Demo · Calyflow" };

export default async function DemoPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const demo = await ensureDemoProject(session.workspaceId, session.userId);

  const [workflow, model, connections, jdDoc] = await Promise.all([
    getWorkspaceWorkflow(session.workspaceId, demo.workflowId),
    getPrimaryRunModel(session.workspaceId),
    listConnections(session.workspaceId),
    getDocument(session.workspaceId, demo.jd.id),
  ]);
  if (!workflow) redirect("/workflows");

  const graph = deriveWorkflowGraph({
    name: workflow.name,
    promptTemplate: workflow.prompt_template,
    inputSpec: workflow.library?.input_spec ?? null,
    outputSpec: workflow.library?.output_spec ?? null,
    model,
    connections: connections.filter((c) => c.status !== "error"),
  });

  const jdPreview = (jdDoc?.extracted_text ?? "").slice(0, 700);

  return (
    <DemoExperience
      projectId={demo.projectId}
      workflowId={demo.workflowId}
      workflowName={workflow.name}
      graph={graph}
      jd={{ id: demo.jd.id, filename: demo.jd.filename, preview: jdPreview }}
      cvs={demo.cvs}
    />
  );
}
