import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getActiveQualification,
  getActiveSourcingPlan,
  getProject,
  listConnections,
} from "@/lib/queries";
import { listCandidates, countQualified } from "@/lib/candidates/queries";
import {
  shortlistSpentUsd,
  connectorSpendByProvider,
} from "@/lib/shortlist/spend";
import { connectedProvidersFrom } from "@/lib/run-items";
import { meteredConnectors, emailEnrichmentConnectors } from "@/lib/connectors";
import { ShortlistPanel } from "@/components/shortlist-panel";
import type { ShortlistRun } from "@/lib/types";

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [
    candidates,
    qualified,
    spentUsd,
    plan,
    criteria,
    latestRunRes,
    connections,
    connectorSpend,
  ] = await Promise.all([
    listCandidates(projectId),
    countQualified(projectId),
    shortlistSpentUsd(projectId),
    getActiveSourcingPlan(session.workspaceId, projectId),
    getActiveQualification(session.workspaceId, projectId),
    db()
      .from("shortlist_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    listConnections(session.workspaceId),
    connectorSpendByProvider(projectId),
  ]);

  const basePath = `/clients/${clientId}/projects/${projectId}`;
  const connectedProviders = connectedProvidersFrom(connections);

  // The connected email-enrichment tools — drives the "Find email" button and
  // the enrichment dialog (one-click for the ⚡ ones, CSV round-trip for all).
  const connectedEnrichment = emailEnrichmentConnectors(connectedProviders);

  // One budget row per connected, metered connector. The cap shown is the
  // project's stored budget if set, else the connector's sensible default.
  const storedBudgets = project.sourcing_connector_budgets ?? {};
  const connectorBudgets = meteredConnectors(connectedProviders).map((c) => ({
    provider: c.provider as string,
    name: c.name,
    unit: c.unit ?? "credits",
    cap: storedBudgets[c.provider as string] ?? c.defaultBudget ?? null,
    spent: connectorSpend[c.provider as string] ?? 0,
  }));

  return (
    <ShortlistPanel
      projectId={project.id}
      archived={project.status !== "active"}
      candidates={candidates}
      qualifiedCount={qualified}
      goalQualified={project.sourcing_goal_qualified}
      budgetUsd={project.sourcing_budget_usd}
      spentUsd={spentUsd}
      connectorBudgets={connectorBudgets}
      connectedEnrichment={connectedEnrichment}
      connectorsHref="/settings/connectors"
      hasPlan={!!plan}
      hasCriteria={!!criteria}
      sourcingPlanHref={`${basePath}/sourcing-plan`}
      qualificationHref={`${basePath}/qualification`}
      initialRun={(latestRunRes.data as ShortlistRun | null) ?? null}
    />
  );
}
