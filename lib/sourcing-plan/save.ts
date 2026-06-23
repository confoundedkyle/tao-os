import "server-only";
import { randomUUID } from "crypto";
import { db } from "../db";

/** Archive the project's current active sourcing plan (one active per project,
 *  like the JD idiom). History is kept; only one plan is live. */
async function archivePreviousSourcingPlan(projectId: string) {
  await db()
    .from("documents")
    .update({ is_active: false })
    .eq("scope_type", "project")
    .eq("scope_id", projectId)
    .eq("doc_type", "sourcing_plan")
    .eq("is_active", true);
}

/** Persist a generated/revised plan as the project's single active
 *  `sourcing_plan` document and return its id. Source-less markdown, so it's
 *  inline-editable via updateDocumentTextAction. */
export async function saveSourcingPlan(
  workspaceId: string,
  projectId: string,
  userId: string,
  markdown: string,
): Promise<string> {
  await archivePreviousSourcingPlan(projectId);
  const id = randomUUID();
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const { error } = await db().from("documents").insert({
    id,
    scope_type: "project",
    scope_id: projectId,
    workspace_id: workspaceId,
    kind: "file",
    doc_type: "sourcing_plan",
    source: "agent",
    filename: `Sourcing plan – ${date}.md`,
    extracted_text: markdown,
    created_by: userId,
  });
  if (error) throw error;
  return id;
}
