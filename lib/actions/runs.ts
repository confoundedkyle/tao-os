"use server";

import { requireSession } from "../auth";
import { assembleContext, renderPrompt } from "../context";
import { getDocument, getProject, getWorkspaceWorkflow } from "../queries";
import type { Doc } from "../types";

/**
 * Assembles the exact prompt a run would execute — same context pipeline as
 * POST /api/runs (workspace KB → client KB → files → project files → inputs)
 * — without starting a run or spending tokens.
 */
export async function previewRunPromptAction(input: {
  projectId: string;
  workflowId: string;
  inputDocIds: string[];
  inputText: string;
}): Promise<{ prompt: string; notes: string[] }> {
  const session = await requireSession();

  const [project, workflow] = await Promise.all([
    getProject(session.workspaceId, input.projectId),
    getWorkspaceWorkflow(session.workspaceId, input.workflowId),
  ]);
  if (!project || !workflow) throw new Error("Not found");

  const inputDocs: Doc[] = [];
  for (const id of input.inputDocIds) {
    const doc = await getDocument(session.workspaceId, id);
    if (
      !doc ||
      doc.scope_type !== "project" ||
      doc.scope_id !== input.projectId
    ) {
      throw new Error("Invalid input doc");
    }
    inputDocs.push(doc);
  }

  const context = await assembleContext(
    session.workspaceId,
    project,
    inputDocs,
    input.inputText,
  );
  const prompt = renderPrompt(workflow.prompt_template, context);
  return { prompt, notes: context.notes };
}
