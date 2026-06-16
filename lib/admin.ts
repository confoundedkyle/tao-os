import "server-only";
import { db } from "./db";

// Admin dashboard data — deliberately NOT workspace-scoped (the service-role
// `db()` client bypasses RLS), so a platform admin sees activity across every
// workspace. Gate all callers with isPlatformAdmin().

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: number | null;
  lastSignInAt: number | null;
  spentUsd: number;
  runCount: number;
}

export interface AdminRunRow {
  id: string;
  kind: "agent" | "workflow";
  name: string;
  provider: string | null;
  model: string | null;
  tokens: number;
  costUsd: number | null;
  createdAt: string;
  runnerId: string | null;
  runnerName: string | null;
}

/** Per-user spend (USD) and run count, summed across agent + workflow runs. */
async function usageByUser(): Promise<Map<string, { spent: number; runs: number }>> {
  const map = new Map<string, { spent: number; runs: number }>();
  for (const table of ["agent_runs", "workflow_runs"] as const) {
    const { data } = await db().from(table).select("created_by, cost_usd");
    for (const row of (data ?? []) as {
      created_by: string | null;
      cost_usd: number | null;
    }[]) {
      const id = row.created_by;
      if (!id) continue;
      const cur = map.get(id) ?? { spent: 0, runs: 0 };
      cur.spent += Number(row.cost_usd ?? 0);
      cur.runs += 1;
      map.set(id, cur);
    }
  }
  return map;
}

/** All registered users (from Clerk) enriched with their spend and run count. */
export async function adminListUsers(): Promise<AdminUser[]> {
  const usage = await usageByUser();
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 200 });
  return users
    .map((u) => {
      const stats = usage.get(u.id) ?? { spent: 0, runs: 0 };
      return {
        id: u.id,
        email: u.emailAddresses[0]?.emailAddress ?? "—",
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        spentUsd: stats.spent,
        runCount: stats.runs,
      };
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** All runs (agent + workflow) excluding the admin's own, newest first. */
export async function adminListRuns(
  excludeUserId: string,
  limit = 100,
): Promise<AdminRunRow[]> {
  const select =
    "id, created_by, provider, model, input_tokens, output_tokens, cost_usd, created_at";
  const [{ data: agentRuns }, { data: workflowRuns }] = await Promise.all([
    db()
      .from("agent_runs")
      .select(`${select}, agent:workspace_agents(name)`)
      .neq("created_by", excludeUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
    db()
      .from("workflow_runs")
      .select(`${select}, workflow:workspace_workflows(name)`)
      .neq("created_by", excludeUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  // Resolve runner names from Clerk in one pass.
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 200 });
  const nameById = new Map(
    users.map((u) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.emailAddresses[0]?.emailAddress ||
        null,
    ]),
  );

  type Raw = {
    id: string;
    created_by: string | null;
    provider: string | null;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
    created_at: string;
    agent?: { name: string } | null;
    workflow?: { name: string } | null;
  };

  const rows: AdminRunRow[] = [
    ...((agentRuns ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      kind: "agent" as const,
      name: r.agent?.name ?? "Agent",
      provider: r.provider,
      model: r.model,
      tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      costUsd: r.cost_usd,
      createdAt: r.created_at,
      runnerId: r.created_by,
      runnerName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
    })),
    ...((workflowRuns ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      kind: "workflow" as const,
      name: r.workflow?.name ?? "Workflow",
      provider: r.provider,
      model: r.model,
      tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      costUsd: r.cost_usd,
      createdAt: r.created_at,
      runnerId: r.created_by,
      runnerName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return rows;
}
