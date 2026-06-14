import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { syncCatalogFromModelsDev } from "@/lib/catalog";

// Constant-time bearer-token check to avoid leaking the secret via response
// timing.
function authorized(header: string): boolean {
  if (!env.cronSecret) return false;
  const expected = `Bearer ${env.cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Daily models.dev → model_catalog sync (SPEC §10). Triggered by Cloud
// Scheduler with `Authorization: Bearer ${CRON_SECRET}`.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (!authorized(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const count = await syncCatalogFromModelsDev();
    return NextResponse.json({ ok: true, models: count });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed" },
      { status: 502 },
    );
  }
}
