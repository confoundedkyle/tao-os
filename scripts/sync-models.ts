/**
 * One-off / local models.dev → model_catalog sync.
 *
 * Production runs the same logic daily via /api/cron/sync-models (Cloud
 * Scheduler + CRON_SECRET). Self-hosters and local dev can run this script
 * directly instead:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync-models
 *
 * Upserts preserve the `curated` flag on existing rows (recommended list).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const SYNCED_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "xai",
  "deepseek",
  "groq",
  "cohere",
];

async function syncModels() {
  const response = await fetch("https://models.dev/api.json", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;

  const rows: Record<string, unknown>[] = [];
  for (const providerId of SYNCED_PROVIDERS) {
    const provider = data[providerId] as
      | { models?: Record<string, Record<string, unknown>> }
      | undefined;
    if (!provider?.models) continue;
    for (const [modelId, model] of Object.entries(provider.models)) {
      const cost = (model.cost ?? {}) as Record<string, number>;
      const limit = (model.limit ?? {}) as Record<string, number>;
      rows.push({
        provider: providerId,
        model_id: modelId,
        display_name: (model.name as string) ?? modelId,
        context_window: limit.context ?? null,
        pricing: {
          input: cost.input ?? null,
          output: cost.output ?? null,
          cache_read: cost.cache_read ?? null,
        },
        raw: model,
        synced_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length === 0) throw new Error("models.dev returned no models");

  const { error } = await db
    .from("model_catalog")
    .upsert(rows, { onConflict: "provider,model_id" });
  if (error) throw new Error(error.message);

  const byProvider = rows.reduce<Record<string, number>>((acc, r) => {
    const p = r.provider as string;
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  for (const [p, n] of Object.entries(byProvider)) {
    console.log(`✓ ${p}: ${n} models`);
  }
  console.log(`Synced ${rows.length} models from models.dev.`);
}

syncModels().catch((err) => {
  console.error(err);
  process.exit(1);
});
