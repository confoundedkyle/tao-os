import "server-only";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "./db";

/**
 * Seeds a brand-new workspace's knowledge base with the starter templates in
 * /data/default-knowledge-base. Edit those .md files to change what every new
 * user starts with — they're plain markdown, editable in the KB UI afterwards.
 *
 * Best-effort: a seeding failure must never block workspace creation.
 */
export async function seedDefaultWorkspaceKb(
  workspaceId: string,
): Promise<void> {
  try {
    const dir = join(process.cwd(), "data", "default-knowledge-base");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length === 0) return;

    const rows = files.map((file) => ({
      scope_type: "workspace",
      scope_id: workspaceId,
      workspace_id: workspaceId,
      kind: "kb",
      doc_type: "note",
      source: "pasted",
      filename: file,
      extracted_text: readFileSync(join(dir, file), "utf8"),
    }));

    const { error } = await db().from("documents").insert(rows);
    if (error) throw error;
  } catch (error) {
    console.error("Default KB seeding failed:", error);
  }
}
