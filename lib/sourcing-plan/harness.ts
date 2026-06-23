import "server-only";
import { db } from "../db";
import { env } from "../env";

// The Sourcing Plan harness is the prompt/IP that drives "Plan mode" — the
// detailed sourcing best practices and output contract. It is deliberately kept
// OUT of the repo (which is treated as public). It is pulled at runtime from a
// private Supabase Storage bucket, server-side only, and cached in-process.
//
// Provisioning is out-of-band: `node scripts/upload-harness.mjs <path>` uploads
// the markdown to `system-config/sourcing-plan/harness.md`. Self-hosters without
// the bucket can instead set SOURCING_PLAN_HARNESS (env fallback).

const BUCKET = "system-config";
const OBJECT_KEY = "sourcing-plan/harness.md";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { text: string; at: number } | null = null;

/** Thrown when no harness is provisioned (bucket object missing AND no env
 *  fallback), so the route can surface a clear, actionable message. */
export class HarnessNotProvisionedError extends Error {
  constructor() {
    super(
      "Sourcing Plan harness is not provisioned. Upload it with " +
        "`node scripts/upload-harness.mjs <path>` or set SOURCING_PLAN_HARNESS.",
    );
    this.name = "HarnessNotProvisionedError";
  }
}

/** Load the sourcing-plan harness, preferring the private bucket and falling
 *  back to the SOURCING_PLAN_HARNESS env var. Cached for CACHE_TTL_MS so a busy
 *  workspace hits Storage once per window, not once per generation. */
export async function loadSourcingPlanHarness(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;

  // Primary: the private bucket object.
  const { data, error } = await db().storage.from(BUCKET).download(OBJECT_KEY);
  if (!error && data) {
    const text = (await data.text()).trim();
    if (text) {
      cached = { text, at: Date.now() };
      return text;
    }
  }

  // Fallback: env var (self-hosting without the bucket).
  const fromEnv = env.sourcingPlanHarness.trim();
  if (fromEnv) {
    cached = { text: fromEnv, at: Date.now() };
    return fromEnv;
  }

  throw new HarnessNotProvisionedError();
}
