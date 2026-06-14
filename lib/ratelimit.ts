import "server-only";
import { db } from "./db";

// Fixed-window rate limiting backed by Postgres (see 0013_rate_limits.sql) so
// the limit holds across Cloud Run instances. Falls back to a per-instance
// in-memory window when the DB/RPC is unavailable (local dev without the
// migration, or a transient outage) — degraded but never fails open silently.

export interface RateLimitOptions {
  /** Max allowed requests within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Returns true when the call is within budget, false when it should be rejected. */
export async function rateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("check_rate_limit", {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch {
    return memoryRateLimit(key, opts);
  }
}

const memBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const bucket = memBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= opts.limit;
}

/**
 * Best-effort caller identity for rate-limit keys: the left-most hop in
 * X-Forwarded-For (set by Cloud Run / the proxy), else the real-IP header,
 * else a constant so the limit still applies in aggregate.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
