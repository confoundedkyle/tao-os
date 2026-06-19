import "server-only";
import { db } from "./db";
import { getLibraryAgentBySlug, listWorkspaceAgents } from "./queries";

/**
 * The "Starter Pack" — the recommended first agents for a new user, in the
 * order they're meant to be run (intake → scorecard → sourcing → outreach). These
 * were originally workflows; workflows are now folded into agents, so the pack
 * imports library agents of the same slugs. Edit this list to change the pack.
 */
export const STARTER_PACK_SLUGS = [
  "job-requirement-analysis",
  "candidate-scorecard-rubric",
  "sourcing-strategy-map",
  "github-sourcer",
  "outreach-writer",
] as const;

/**
 * Idempotently make sure every Starter Pack agent is installed AND enabled in
 * the workspace, and clean up the now-retired workflow copies. Best-effort: a
 * failure must never block the page it runs on.
 */
export async function ensureStarterPack(workspaceId: string): Promise<void> {
  try {
    // Workflows have been folded into agents. Archive every still-active
    // workspace workflow copy so they stop appearing next to the agents. (The
    // rows and their run history stay; the seed detaches library_workflow_id
    // when it retires the library rows, so we can't filter on that link here.)
    await db()
      .from("workspace_workflows")
      .update({ archived_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .is("archived_at", null);

    const installed = await listWorkspaceAgents(workspaceId);
    const bySlug = new Map(
      installed.filter((a) => a.library?.slug).map((a) => [a.library!.slug, a]),
    );

    for (const slug of STARTER_PACK_SLUGS) {
      // Only auto-install a pack agent the workspace has NEVER imported. If a
      // copy already exists — even archived — leave it alone, so a deliberate
      // archive isn't undone on the next project visit.
      if (bySlug.has(slug)) continue;
      const lib = await getLibraryAgentBySlug(slug);
      if (!lib) continue;
      await db().from("workspace_agents").insert({
        workspace_id: workspaceId,
        library_agent_id: lib.id,
        name: lib.name,
        instructions: lib.instructions,
        allowed_tools: lib.allowed_tools,
        model: lib.model,
        max_steps: lib.max_steps,
        imported_version: lib.version,
      });
    }
  } catch (error) {
    console.error("ensureStarterPack failed:", error);
  }
}
