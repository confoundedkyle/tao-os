"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";

/** One-click import: snapshot copy of a library agent into the workspace. */
export async function importAgentAction(libraryAgentId: string) {
  const session = await requireSession();
  const { data: library, error: libraryError } = await db()
    .from("library_agents")
    .select("*")
    .eq("id", libraryAgentId)
    .single();
  if (libraryError || !library) throw new Error("Agent not found");

  const { error } = await db()
    .from("workspace_agents")
    .insert({
      workspace_id: session.workspaceId,
      library_agent_id: library.id,
      name: library.name,
      instructions: library.instructions,
      allowed_tools: library.allowed_tools,
      model: library.model,
      max_steps: library.max_steps,
      imported_version: library.version,
    });
  if (error) throw error;
  revalidatePath("/");
}

/** Soft-archive: the agent leaves lists/pickers but its run history stays
 *  intact (agent_runs reference workspace_agents without a cascade). */
export async function archiveAgentAction(agentId: string) {
  const session = await requireSession();
  const { error } = await db()
    .from("workspace_agents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("workspace_id", session.workspaceId);
  if (error) throw error;
  revalidatePath("/workflows");
}

export async function restoreAgentAction(agentId: string) {
  const session = await requireSession();
  const { error } = await db()
    .from("workspace_agents")
    .update({ archived_at: null })
    .eq("id", agentId)
    .eq("workspace_id", session.workspaceId);
  if (error) throw error;
  revalidatePath("/workflows");
}
