import "server-only";
import { db } from "../db";
import { connectorLabel } from "../connectors";

// Channel-performance signals for one project: what past sourcing waves cost and
// yielded, and which channels they actually used. Channels come from the run's
// tool-call TRACE (shortlist_runs.steps), not the credit ledger — because free
// channels (SignalHire search, web_search, GitHub) spend no credits and would
// otherwise be invisible, making an incidental paid scrape look like the whole
// wave. The credit ledger (connector_credit_usage) only annotates spend where a
// channel is metered. Shown in the cockpit AND fed to the strategist prompt.

export interface RunSignal {
  runId: string;
  createdAt: string;
  /** The session (strategist conversation) that launched this run, if any. */
  conversationId: string | null;
  candidatesAdded: number;
  /** Newly-qualified this run (qualified_after minus the prior run's total). */
  qualifiedDelta: number;
  qualifiedAfter: number;
  costUsd: number;
  /** Channels this run actually used, from its trace. `credits` is native-unit
   *  spend where the channel is metered, else 0 (free channels like SignalHire
   *  search / web_search / GitHub). */
  connectors: { provider: string; label: string; credits: number }[];
  strategy: string | null;
  /** The run's self-graded outcome + learnings (see lib/shortlist/run.ts). */
  outcome: string | null; // successful | weak | dry
  learnings: string | null;
}

/** Map a tool name from a run's step trace to the sourcing channel it represents.
 *  Returns null for internal KB/candidate tools and reasoning — not channels.
 *  web_scrape → firecrawl so the metered-scrape ledger annotates it. */
function channelFromTool(
  tool: string,
): { slug: string; label: string } | null {
  if (tool === "web_search") return { slug: "web", label: "Web search" };
  if (tool === "web_scrape") return { slug: "firecrawl", label: "Firecrawl (scrape)" };
  if (tool.startsWith("github_")) return { slug: "github", label: "GitHub" };
  if (tool.startsWith("signalhire_")) return { slug: "signalhire", label: "SignalHire" };
  if (tool.startsWith("coresignal_")) return { slug: "coresignal", label: "Coresignal" };
  if (tool.startsWith("apollo_")) return { slug: "apollo", label: "Apollo" };
  if (tool.startsWith("contactout_")) return { slug: "contactout", label: "ContactOut" };
  if (tool.startsWith("rocketreach_")) return { slug: "rocketreach", label: "RocketReach" };
  return null;
}

export interface ProviderRollup {
  provider: string;
  label: string;
  credits: number;
}

export interface ChannelSignals {
  runs: RunSignal[]; // newest-first, for display
  providerRollup: ProviderRollup[]; // biggest spender first
  totals: {
    runs: number;
    candidatesAdded: number;
    qualified: number;
    costUsd: number;
  };
}

/** Build the channel-performance signals for a project. Only counts completed
 *  runs (a still-running row has no final yield yet). */
export async function getChannelSignals(
  projectId: string,
): Promise<ChannelSignals> {
  const [{ data: runRows }, { data: usageRows }] = await Promise.all([
    db()
      .from("shortlist_runs")
      .select(
        "id, status, steps, candidates_added, qualified_after, cost_usd, strategy, outcome, learnings, conversation_id, created_at",
      )
      .eq("project_id", projectId)
      .neq("status", "running")
      .order("created_at", { ascending: true }),
    db()
      .from("connector_credit_usage")
      .select("shortlist_run_id, provider, credits")
      .eq("project_id", projectId),
  ]);

  // Credits per run per provider.
  const perRun = new Map<string, Map<string, number>>();
  const rollup = new Map<string, number>();
  for (const u of (usageRows ?? []) as {
    shortlist_run_id: string | null;
    provider: string;
    credits: number | null;
  }[]) {
    const credits = Number(u.credits ?? 0);
    if (!(credits > 0)) continue;
    rollup.set(u.provider, (rollup.get(u.provider) ?? 0) + credits);
    if (!u.shortlist_run_id) continue;
    const m = perRun.get(u.shortlist_run_id) ?? new Map<string, number>();
    m.set(u.provider, (m.get(u.provider) ?? 0) + credits);
    perRun.set(u.shortlist_run_id, m);
  }

  const runs: RunSignal[] = [];
  let prevQualified = 0;
  let totalAdded = 0;
  let totalCost = 0;
  for (const r of (runRows ?? []) as {
    id: string;
    steps: { type?: string; tool?: string }[] | null;
    candidates_added: number | null;
    qualified_after: number | null;
    cost_usd: number | null;
    strategy: string | null;
    outcome: string | null;
    learnings: string | null;
    conversation_id: string | null;
    created_at: string;
  }[]) {
    const qualifiedAfter = r.qualified_after ?? prevQualified;
    const qualifiedDelta = Math.max(qualifiedAfter - prevQualified, 0);
    prevQualified = qualifiedAfter;
    const added = r.candidates_added ?? 0;
    const cost = Number(r.cost_usd ?? 0);
    totalAdded += added;
    totalCost += cost;
    // Channels actually used, from the tool-call trace (distinct, first-seen
    // order), annotated with metered spend from the ledger where present.
    const creditsForRun = perRun.get(r.id) ?? new Map<string, number>();
    const channelOrder: string[] = [];
    const channelLabel = new Map<string, string>();
    for (const step of r.steps ?? []) {
      if (step.type !== "tool-call" || !step.tool) continue;
      const ch = channelFromTool(step.tool);
      if (!ch || channelLabel.has(ch.slug)) continue;
      channelLabel.set(ch.slug, ch.label);
      channelOrder.push(ch.slug);
    }
    // Include any metered provider that spent but somehow wasn't in the trace.
    for (const slug of creditsForRun.keys()) {
      if (!channelLabel.has(slug)) {
        channelLabel.set(slug, connectorLabel(slug));
        channelOrder.push(slug);
      }
    }
    const connectors = channelOrder.map((slug) => ({
      provider: slug,
      label: channelLabel.get(slug) ?? connectorLabel(slug),
      credits: Number(creditsForRun.get(slug) ?? 0),
    }));
    runs.push({
      runId: r.id,
      createdAt: r.created_at,
      conversationId: r.conversation_id ?? null,
      candidatesAdded: added,
      qualifiedDelta,
      qualifiedAfter,
      costUsd: cost,
      connectors,
      strategy: r.strategy ?? null,
      outcome: r.outcome ?? null,
      learnings: r.learnings ?? null,
    });
  }

  const providerRollup: ProviderRollup[] = [...rollup.entries()]
    .map(([provider, credits]) => ({
      provider,
      label: connectorLabel(provider),
      credits,
    }))
    .sort((a, b) => b.credits - a.credits);

  runs.reverse(); // newest-first for display
  return {
    runs,
    providerRollup,
    totals: {
      runs: runs.length,
      candidatesAdded: totalAdded,
      qualified: prevQualified,
      costUsd: totalCost,
    },
  };
}

/** A session's own progress: qualified candidates added and USD spent across the
 *  runs that session launched. Derived from the project's run signals (runs are
 *  serialised, so per-run deltas attribute cleanly to their session). */
export function sessionProgress(
  signals: ChannelSignals,
  conversationId: string | null,
): { qualified: number; spent: number } {
  if (!conversationId) return { qualified: 0, spent: 0 };
  let qualified = 0;
  let spent = 0;
  for (const r of signals.runs) {
    if (r.conversationId !== conversationId) continue;
    qualified += r.qualifiedDelta;
    spent += r.costUsd;
  }
  return { qualified, spent };
}

/** A compact prompt block so the strategist reasons over what actually worked.
 *  Empty string when there's no history yet (nothing to say). */
export function formatChannelSignalsBlock(signals: ChannelSignals): string {
  if (signals.runs.length === 0) return "";
  const lines: string[] = [
    "# Channel performance so far (this project)",
    "Past sourcing searches and their yield — use this to double down on what worked " +
      "and avoid what didn't:",
  ];
  for (const r of signals.runs) {
    const date = r.createdAt.slice(0, 10);
    const chans =
      r.connectors.length > 0
        ? r.connectors
            .map((c) => (c.credits > 0 ? `${c.label} ${c.credits}cr` : c.label))
            .join(", ")
        : "no channels recorded";
    const grade = r.outcome ? ` [${r.outcome}]` : "";
    lines.push(
      `- ${date}${grade}: +${r.candidatesAdded} saved, +${r.qualifiedDelta} qualified, ` +
        `$${r.costUsd.toFixed(2)} — via ${chans}`,
    );
  }
  if (signals.providerRollup.length > 0) {
    lines.push(
      "Total metered spend by connector: " +
        signals.providerRollup
          .map((p) => `${p.label} ${p.credits}cr`)
          .join(", "),
    );
  }

  // The most recent runs' learnings — the concrete "do more / do less" the agent
  // saved after grading itself. Cap at the 3 newest that have any.
  const withLearnings = signals.runs
    .filter((r) => r.learnings?.trim())
    .slice(0, 3);
  if (withLearnings.length > 0) {
    lines.push("", "## Learnings from recent searches (apply these)");
    for (const r of withLearnings) {
      lines.push(`From ${r.createdAt.slice(0, 10)} (${r.outcome ?? "?"}):`);
      lines.push(r.learnings!.trim());
    }
  }
  return lines.join("\n");
}
