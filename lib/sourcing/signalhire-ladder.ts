import "server-only";
import { z } from "zod";
import { env } from "../env";
import { loadHarness, HarnessNotProvisionedError } from "../harness";
import type { SignalHireLadderSpec } from "../integrations/signalhire";

// The SignalHire search ladder: the tier order + field mapping that drives
// signalhire_source_people. Like the Coresignal ladder it can be overridden by a
// proprietary spec in the private `system-config` bucket (or the
// SIGNALHIRE_LADDER env var). UNLIKE the Coresignal one it ships a GENERIC
// committed default here, so the tool works out of the box — SignalHire's search
// is free, so there's no credit-strategy IP to protect. Provision an override
// with:
//   node scripts/upload-harness.mjs secrets/sourcing/signalhire-ladder.json sourcing/signalhire-ladder.json

const OBJECT_KEY = "sourcing/signalhire-ladder.json";

const tierSchema = z.object({
  name: z.string(),
  weight: z.number(),
  titlesFrom: z.string().optional(),
  companiesFrom: z.string().optional(),
  keywordsFrom: z.array(z.string()).optional(),
  keywordsJoin: z.enum(["AND", "OR"]).optional(),
  useLocation: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  maxSearches: z.number().int().positive().optional(),
});

const specSchema = z.object({
  defaults: z.object({
    targetCount: z.number().int().positive(),
    maxSearches: z.number().int().positive(),
    limit: z.number().int().positive().optional(),
    concurrency: z.number().int().positive().optional(),
  }),
  tiers: z.array(tierSchema).min(1),
});

/** Parse + validate a raw ladder spec. Exported for tests. */
export function parseSignalHireLadderSpec(raw: string): SignalHireLadderSpec {
  return specSchema.parse(JSON.parse(raw)) as SignalHireLadderSpec;
}

// Committed ladder — an advanced, cost/speed-aware default. SignalHire search is
// free, so "cost" here is COMPUTE + latency: run the fewest, most-precise
// searches first, pull big pages only on high-signal tiers, dedupe identical
// queries, and stop the moment the target is met. Tiers descend from tightest
// (exact title + all skills + location) to broadest (skills-only, then geo-wide),
// weighted so the tightest matches rank first. The driver runs a tier's searches
// concurrently and short-circuits between tiers.
//
// Progression:
//   1. exact title + ALL skills (AND) + location   — tightest, highest signal
//   2. exact title at each target company + location — precise, employer-led
//   3. exact title + location (skills dropped)       — broaden the must-haves
//   4. adjacent/synonym title + skills + location    — widen the role
//   5. skills/keywords only (OR) + location          — skill-led net, no title
//   6. exact title + skills, NO location             — widen geography last
const GENERIC_SPEC: SignalHireLadderSpec = {
  defaults: { targetCount: 25, maxSearches: 18, limit: 25, concurrency: 4 },
  tiers: [
    {
      name: "exact title + all skills + location",
      weight: 6,
      titlesFrom: "currentTitles",
      keywordsFrom: ["skills"],
      keywordsJoin: "AND",
      useLocation: true,
      limit: 25,
    },
    {
      name: "exact title at target companies",
      weight: 5,
      titlesFrom: "currentTitles",
      companiesFrom: "companies",
      useLocation: true,
      limit: 15,
      maxSearches: 6,
    },
    {
      name: "exact title + location",
      weight: 4,
      titlesFrom: "currentTitles",
      useLocation: true,
      limit: 25,
    },
    {
      name: "adjacent title + skills + location",
      weight: 3,
      titlesFrom: "adjacentTitles",
      keywordsFrom: ["skills"],
      keywordsJoin: "AND",
      useLocation: true,
      limit: 20,
    },
    {
      name: "skills / keywords + location",
      weight: 2,
      keywordsFrom: ["skills", "keywords"],
      keywordsJoin: "OR",
      useLocation: true,
      limit: 15,
    },
    {
      name: "exact title + skills, any location",
      weight: 1,
      titlesFrom: "currentTitles",
      keywordsFrom: ["skills"],
      keywordsJoin: "AND",
      limit: 15,
    },
  ],
};

export async function loadSignalHireLadder(): Promise<SignalHireLadderSpec> {
  try {
    const raw = await loadHarness(
      OBJECT_KEY,
      env.signalhireLadder,
      "SIGNALHIRE_LADDER",
    );
    return parseSignalHireLadderSpec(raw);
  } catch (err) {
    // No override provisioned → the committed generic ladder.
    if (err instanceof HarnessNotProvisionedError) return GENERIC_SPEC;
    throw err;
  }
}
