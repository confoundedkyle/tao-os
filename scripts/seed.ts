/**
 * Seeds the database from repo files (SPEC §4, §13):
 *   - /workflows/*.yaml        → library_workflows (upsert by slug)
 *   - /agents/*.yaml           → library_agents (upsert by slug)
 *   - /data/model-catalog-snapshot.json → model_catalog (upsert)
 *
 * The same mechanism that seeds Calyflow cloud seeds any self-hosted
 * instance. Idempotent — safe to run on every deploy.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { load } from "js-yaml";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

interface WorkflowYaml {
  slug: string;
  name: string;
  description: string;
  category: string;
  version: number;
  input_spec: unknown;
  output_spec: unknown;
  prompt_template: string;
}

async function seedWorkflows() {
  const dir = join(__dirname, "..", "workflows");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  for (const file of files) {
    const wf = load(readFileSync(join(dir, file), "utf8")) as WorkflowYaml;
    const { error } = await db.from("library_workflows").upsert(
      {
        slug: wf.slug,
        name: wf.name,
        description: wf.description,
        category: wf.category,
        version: wf.version,
        input_spec: wf.input_spec,
        output_spec: wf.output_spec,
        prompt_template: wf.prompt_template,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`${file}: ${error.message}`);
    console.log(`✓ workflow ${wf.slug} (v${wf.version})`);
  }
}

interface AgentYaml {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  allowed_tools: string[];
  model: string | null;
  max_steps: number;
  version?: number;
}

async function seedAgents() {
  const dir = join(__dirname, "..", "agents");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  } catch {
    return; // no agents directory yet — nothing to seed
  }
  for (const file of files) {
    const a = load(readFileSync(join(dir, file), "utf8")) as AgentYaml;
    const { error } = await db.from("library_agents").upsert(
      {
        slug: a.slug,
        name: a.name,
        description: a.description,
        instructions: a.instructions,
        allowed_tools: a.allowed_tools,
        model: a.model ?? null,
        max_steps: a.max_steps ?? 12,
        version: a.version ?? 1,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`${file}: ${error.message}`);
    console.log(`✓ agent ${a.slug} (v${a.version ?? 1})`);
  }
}

async function seedCatalog() {
  const snapshot = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "model-catalog-snapshot.json"), "utf8"),
  ) as { models: Record<string, unknown>[] };
  const rows = snapshot.models.map((m) => ({
    ...m,
    raw: { source: "snapshot" },
    synced_at: new Date().toISOString(),
  }));
  const { error } = await db
    .from("model_catalog")
    .upsert(rows, { onConflict: "provider,model_id" });
  if (error) throw new Error(error.message);
  console.log(`✓ model catalog (${rows.length} models)`);
}

(async () => {
  await seedWorkflows();
  await seedAgents();
  await seedCatalog();
  console.log("Seed complete.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
