import "server-only";
import { db } from "./db";
import { getLibraryWorkflowBySlug, listWorkspaceWorkflows } from "./queries";

/**
 * The "Workflow Starter Pack" — the recommended first workflows for a new user,
 * in the order they're meant to be run (intake → ICP → sourcing → outreach).
 * Edit this list to change the pack: slugs added here auto-install on the next
 * visit; slugs removed just stop showing in the pack UI (already-imported copies
 * are left untouched so a user's edits/archives are never clobbered).
 */
export const STARTER_PACK_SLUGS = [
  "job-requirement-analysis",
  "candidate-icp-builder",
  "sourcing-map",
  "outreach-writer",
] as const;

/**
 * Idempotently make sure every Starter Pack workflow is installed AND enabled in
 * the workspace: import the missing ones and restore any that were archived, so
 * the pack is always available. (The pack *hint* can still be dismissed in the
 * run panel — that hides the cards, not the workflows.) Best-effort: a failure
 * must never block the page it runs on.
 */
export async function ensureStarterPack(workspaceId: string): Promise<void> {
  try {
    const installed = await listWorkspaceWorkflows(workspaceId);
    const bySlug = new Map(
      installed
        .filter((w) => w.library?.slug)
        .map((w) => [w.library!.slug, w]),
    );

    for (const slug of STARTER_PACK_SLUGS) {
      const existing = bySlug.get(slug);
      if (existing) {
        if (existing.archived_at) {
          await db()
            .from("workspace_workflows")
            .update({ archived_at: null })
            .eq("id", existing.id);
        }
        continue;
      }
      const lib = await getLibraryWorkflowBySlug(slug);
      if (!lib) continue;
      await db().from("workspace_workflows").insert({
        workspace_id: workspaceId,
        library_workflow_id: lib.id,
        name: lib.name,
        prompt_template: lib.prompt_template,
        imported_version: lib.version,
      });
    }
  } catch (error) {
    console.error("ensureStarterPack failed:", error);
  }
}
