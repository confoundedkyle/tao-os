import "server-only";
import { db } from "./db";
import { isAgenticModel } from "./ai-catalog";

// Model catalog sync — SPEC §10. The UI reads only from model_catalog; this
// module fills it from models.dev (daily cron) or the bundled snapshot.
// Lightweight mini/nano tiers are filtered out — they don't reliably run
// multi-step agent loops, so we never store or surface them.

interface SnapshotModel {
  provider: string;
  model_id: string;
  display_name: string;
  context_window: number | null;
  pricing: { input?: number; output?: number; cache_read?: number };
  curated: boolean;
}

export async function seedCatalogFromSnapshot(): Promise<number> {
  const snapshot = (await import("@/data/model-catalog-snapshot.json"))
    .default as { models: SnapshotModel[] };
  const rows = snapshot.models
    .filter((m) => isAgenticModel(m.model_id))
    .map((m) => ({
      ...m,
      raw: { source: "snapshot" },
      synced_at: new Date().toISOString(),
    }));
  const { error } = await db()
    .from("model_catalog")
    .upsert(rows, { onConflict: "provider,model_id" });
  if (error) throw error;
  return rows.length;
}

/**
 * models.dev/api.json: object keyed by provider id; each provider has a
 * `models` object keyed by model id with `name`, `cost` (USD per 1M tokens:
 * input/output/cache_read) and `limit.context`. Parsed defensively — shape
 * verified at sync time, not trusted.
 */
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

export async function syncCatalogFromModelsDev(): Promise<number> {
  const response = await fetch("https://models.dev/api.json", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`models.dev returned ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;

  const rows: Record<string, unknown>[] = [];
  for (const providerId of SYNCED_PROVIDERS) {
    const provider = data[providerId] as
      | { models?: Record<string, Record<string, unknown>> }
      | undefined;
    if (!provider?.models) continue;
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (!isAgenticModel(modelId)) continue; // keep mini/nano tiers out
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

  // Upsert preserves the `curated` flag on existing rows by not including it.
  const { error } = await db()
    .from("model_catalog")
    .upsert(rows, { onConflict: "provider,model_id" });
  if (error) throw error;
  return rows.length;
}
