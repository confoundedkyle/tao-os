import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "../db";
import { KB_AREAS } from "./areas";

const FILENAMES = KB_AREAS.map((a) => a.filename);

/**
 * The single tool the knowledge-base onboarding assistant has: write (or
 * enrich) one workspace knowledge-base document. It UPSERTS by filename within
 * the workspace KB so revisiting an area updates that document instead of
 * creating duplicates — the key to the "continue another day, enrich later"
 * flow. Scope is taken from the server-derived context, never the model, so a
 * prompt-injected assistant can't write to another workspace.
 *
 * `savedFilenames` is mutated with each filename written this turn so the route
 * can surface what changed (and the panel can refresh the document list).
 */
export function buildOnboardingTools(
  workspaceId: string,
  userId: string,
  savedFilenames: string[],
): ToolSet {
  return {
    onboarding_save_kb_doc: tool({
      description:
        "Create or update one knowledge-base document for this workspace as you " +
        "learn from the user. Upserts by filename: pass the SAME filename again " +
        "to enrich an existing document (provide its full updated content). " +
        "Save a useful first pass as soon as you have one — don't wait for the " +
        "area to be complete.",
      inputSchema: z.object({
        filename: z
          .enum(FILENAMES as [string, ...string[]])
          .describe("Which knowledge-base document to write."),
        content: z
          .string()
          .describe(
            "The COMPLETE markdown for this document (a # title then ## " +
              "sections). When enriching, include everything still accurate, " +
              "not just the new part.",
          ),
      }),
      execute: async ({ filename, content }) => {
        const text = content.trim();
        if (!text) return { error: "Nothing to save — content was empty." };

        const { data: existing, error: selectError } = await db()
          .from("documents")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("scope_type", "workspace")
          .eq("scope_id", workspaceId)
          .eq("kind", "kb")
          .eq("filename", filename)
          .maybeSingle();
        if (selectError) {
          console.error("onboarding_save_kb_doc: select failed", selectError);
          return { error: "Could not save the document. Please try again." };
        }

        if (existing) {
          const { error } = await db()
            .from("documents")
            .update({ extracted_text: text })
            .eq("id", existing.id);
          if (error) {
            console.error("onboarding_save_kb_doc: update failed", error);
            return { error: "Could not update the document. Please try again." };
          }
          if (!savedFilenames.includes(filename)) savedFilenames.push(filename);
          return { filename, status: "updated" };
        }

        const { error } = await db().from("documents").insert({
          scope_type: "workspace",
          scope_id: workspaceId,
          workspace_id: workspaceId,
          kind: "kb",
          doc_type: "note",
          source: "agent",
          filename,
          extracted_text: text,
          created_by: userId,
        });
        if (error) {
          console.error("onboarding_save_kb_doc: insert failed", error);
          return { error: "Could not save the document. Please try again." };
        }
        if (!savedFilenames.includes(filename)) savedFilenames.push(filename);
        return { filename, status: "created" };
      },
    }),
  };
}
