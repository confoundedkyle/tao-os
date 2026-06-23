import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getActiveSourcingPlan,
  getActiveSourcingPlanConversation,
  getPrimaryRunModel,
  getProject,
  listDocuments,
} from "@/lib/queries";
import { SourcingPlanPanel } from "@/components/sourcing-plan-panel";

export default async function SourcingPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const { c: conversationParam } = await searchParams;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [plan, conversation, model, projectDocs] = await Promise.all([
    getActiveSourcingPlan(session.workspaceId, projectId),
    getActiveSourcingPlanConversation(
      session.workspaceId,
      projectId,
      conversationParam,
    ),
    getPrimaryRunModel(session.workspaceId),
    listDocuments(session.workspaceId, "project", projectId, "file"),
  ]);

  const hasJd = projectDocs.some((d) => d.is_active && d.doc_type === "jd");

  return (
    <SourcingPlanPanel
      key={conversation?.conversationId ?? "new"}
      projectId={project.id}
      plan={
        plan
          ? {
              id: plan.id,
              filename: plan.filename ?? "Sourcing plan",
              text: plan.extracted_text ?? "",
              createdAt: plan.created_at,
            }
          : null
      }
      hasJd={hasJd}
      archived={project.status !== "active"}
      model={model}
      documentsHref={`/clients/${clientId}/projects/${projectId}/documents`}
      initialConversation={conversation}
    />
  );
}
