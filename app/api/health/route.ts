import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Never cache: the deploy smoke test hits this to confirm the new revision can
// actually reach and query the database before traffic is cut over to it.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lightweight round-trip against a always-present seeded table — proves the
    // app booted, env is wired, and Postgres is reachable and queryable.
    const { error } = await db()
      .from("library_workflows")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "db unreachable" },
      { status: 503 },
    );
  }
}
