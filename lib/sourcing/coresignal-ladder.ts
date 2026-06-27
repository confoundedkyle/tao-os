import "server-only";
import { z } from "zod";
import { env } from "../env";
import { loadHarness, HarnessNotProvisionedError } from "../harness";
import type { CoresignalLadderSpec } from "../integrations/coresignal";

// The Coresignal search-ladder spec is proprietary IP — the tier definitions,
// ES DSL field choices, widening order, and weights that drive
// coresignal_source_employees. Like the harnesses it lives in the private
// `system-config` bucket, never in the repo; lib/integrations/coresignal.ts
// holds only a strategy-free interpreter. Provision with:
//   node scripts/upload-harness.mjs secrets/sourcing/coresignal-ladder.json sourcing/coresignal-ladder.json

export { HarnessNotProvisionedError };

const OBJECT_KEY = "sourcing/coresignal-ladder.json";

const clauseSchema: z.ZodType = z.lazy(() =>
  z.object({
    bool: z.enum(["must", "should", "filter", "must_not"]),
    op: z.enum(["match", "match_phrase", "term", "query_string", "nested"]),
    field: z.string().optional(),
    fields: z.array(z.string()).optional(),
    valuesFrom: z.string().optional(),
    value: z.unknown().optional(),
    defaultOperator: z.enum(["and", "or"]).optional(),
    path: z.string().optional(),
    clauses: z.array(clauseSchema).optional(),
  }),
);

const specSchema = z.object({
  defaults: z.object({
    targetCount: z.number().int().positive(),
    maxCollects: z.number().int().positive(),
    creditBudget: z.number().int().positive(),
  }),
  tiers: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number(),
        clauses: z.array(clauseSchema),
      }),
    )
    .min(1),
});

/** Parse + validate a raw ladder spec. Exported so tests can run a fixture spec
 *  through the same validation without touching Storage. */
export function parseLadderSpec(raw: string): CoresignalLadderSpec {
  return specSchema.parse(JSON.parse(raw)) as CoresignalLadderSpec;
}

let cached: { spec: CoresignalLadderSpec; raw: string } | null = null;

/** Load the ladder spec from the private bucket (env fallback for self-hosters),
 *  parsed + validated. Caches the parse keyed by the raw text. */
export async function loadCoresignalLadder(): Promise<CoresignalLadderSpec> {
  const raw = await loadHarness(
    OBJECT_KEY,
    env.coresignalLadder,
    "CORESIGNAL_LADDER",
  );
  if (cached && cached.raw === raw) return cached.spec;
  const spec = parseLadderSpec(raw);
  cached = { spec, raw };
  return spec;
}
