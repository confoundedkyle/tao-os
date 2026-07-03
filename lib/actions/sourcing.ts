"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { getProject } from "../queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Save a Sourcing session's own goal (qualified count) + budget (USD). These are
 *  per-session — a session pursues this goal within this budget; the project-level
 *  cap (Project Settings) gates it. Upserts the session row (creating it if the
 *  session is brand-new). Either value may be cleared (null). */
export async function setSessionTargetsAction(
  projectId: string,
  conversationId: string,
  goalQualified: number | null,
  budgetUsd: number | null,
): Promise<void> {
  const session = await requireSession();
  const project = await getProject(session.workspaceId, projectId);
  if (!project) throw new Error("Project not found");
  if (!UUID_RE.test(conversationId)) throw new Error("Invalid session");

  const goal =
    goalQualified != null && Number.isFinite(goalQualified) && goalQualified > 0
      ? Math.floor(goalQualified)
      : null;
  const budget =
    budgetUsd != null && Number.isFinite(budgetUsd) && budgetUsd > 0
      ? Math.round(budgetUsd * 100) / 100
      : null;

  const { error } = await db()
    .from("sourcing_sessions")
    .upsert(
      {
        project_id: projectId,
        conversation_id: conversationId,
        goal_qualified: goal,
        budget_usd: budget,
      },
      { onConflict: "conversation_id" },
    );
  if (error) throw error;

  revalidatePath(`/clients/${project.client_id}/projects/${projectId}/sourcing`);
}

/** Archive (or restore) a Sourcing session. Archiving only moves it to the muted
 *  "Archived" group at the bottom of the cockpit's session rail — the session
 *  and its runs stay fully in Settings → Usage. Idempotent per conversation. */
export async function setSessionArchivedAction(
  projectId: string,
  conversationId: string,
  archived: boolean,
): Promise<void> {
  const session = await requireSession();
  const project = await getProject(session.workspaceId, projectId);
  if (!project) throw new Error("Project not found");
  if (!UUID_RE.test(conversationId)) throw new Error("Invalid session");

  const { error } = await db()
    .from("sourcing_sessions")
    .upsert(
      {
        project_id: projectId,
        conversation_id: conversationId,
        archived_at: archived ? new Date().toISOString() : null,
      },
      { onConflict: "conversation_id" },
    );
  if (error) throw error;

  revalidatePath(
    `/clients/${project.client_id}/projects/${projectId}/sourcing`,
  );
}
