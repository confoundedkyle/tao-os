/**
 * Backfills the starter knowledge-base templates (/data/default-knowledge-base)
 * into ALL existing workspaces. New workspaces get them automatically at
 * creation (lib/default-kb.ts); this is for workspaces created before that.
 *
 * Idempotent: skips any file a workspace already has (matched by filename in
 * its workspace KB), so re-running or mixing with user edits is safe.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed-default-kb
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function backfill() {
  const dir = join(__dirname, "..", "data", "default-knowledge-base");
  const templates = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({
      filename: file,
      text: readFileSync(join(dir, file), "utf8"),
    }));
  if (templates.length === 0) throw new Error("No templates found");

  const { data: workspaces, error: wsError } = await db
    .from("workspaces")
    .select("id, name");
  if (wsError) throw new Error(wsError.message);

  for (const ws of workspaces ?? []) {
    const { data: existing, error: docsError } = await db
      .from("documents")
      .select("filename")
      .eq("workspace_id", ws.id)
      .eq("scope_type", "workspace")
      .eq("kind", "kb");
    if (docsError) throw new Error(docsError.message);

    const have = new Set((existing ?? []).map((d) => d.filename));
    const missing = templates.filter((t) => !have.has(t.filename));
    if (missing.length === 0) {
      console.log(`• ${ws.name}: already complete, skipped`);
      continue;
    }

    const { error: insertError } = await db.from("documents").insert(
      missing.map((t) => ({
        scope_type: "workspace",
        scope_id: ws.id,
        workspace_id: ws.id,
        kind: "kb",
        doc_type: "note",
        source: "pasted",
        filename: t.filename,
        extracted_text: t.text,
      })),
    );
    if (insertError) throw new Error(insertError.message);
    console.log(`✓ ${ws.name}: added ${missing.length} template(s)`);
  }
  console.log("Backfill complete.");
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
