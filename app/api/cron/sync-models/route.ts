import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncCatalogFromModelsDev } from "@/lib/catalog";

// Daily models.dev → model_catalog sync (SPEC §10). Triggered by Cloud
// Scheduler with `Authorization: Bearer ${CRON_SECRET}`.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
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
