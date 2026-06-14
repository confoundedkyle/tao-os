import {
  CONNECTOR_CATEGORY_LABELS,
  connectorsForCategory,
  requiredConnectorCategories,
} from "@/lib/connectors";
import {
  listConnections,
  listDocuments,
  listWorkspaceAgents,
  listWorkspaceWorkflows,
} from "@/lib/queries";
import { preflightWorkflow } from "@/lib/readiness";
import { agentDocSpec } from "@/lib/workflow-graph";
import { STARTER_PACK_SLUGS } from "@/lib/starter-pack";
import type { AgentConnectorRequirement } from "@/components/agent-run-panel";
import type { RunSidebarItem } from "@/components/run-sidebar";

/** An agent's required connector categories, each paired with the workspace's
 *  connected options of that category (empty = not connected yet). */
export function agentRequirements(
  tools: string[],
  connectedProviders: Set<string>,
): AgentConnectorRequirement[] {
  return requiredConnectorCategories(tools).map((category) => ({
    category,
    label: CONNECTOR_CATEGORY_LABELS[category],
    options: connectorsForCategory(category)
      .filter((c) => c.provider && connectedProviders.has(c.provider))
      .map((c) => ({ provider: c.provider!, label: c.name })),
  }));
}

/** An agent is ready when every connector category it needs has an option. */
export function agentReady(reqs: AgentConnectorRequirement[]): boolean {
  return reqs.every((r) => r.options.length > 0);
}

/** Whether all of an agent's required documents exist (active) in the project. */
export function requiredDocsPresent(
  slug: string | null | undefined,
  presentDocTypes: Set<string>,
): boolean {
  const spec = agentDocSpec(slug ?? undefined);
  return spec ? spec.required.every((t) => presentDocTypes.has(t)) : true;
}

/** Active connector providers for the workspace (the agents' connector pool). */
export function connectedProvidersFrom(
  connections: { provider: string; status: string }[],
): Set<string> {
  return new Set(
    connections.filter((c) => c.status === "active").map((c) => c.provider),
  );
}

/**
 * The unified, ordered list for the project's run sidebar: workflows and agents
 * intermixed. Starter-pack workflows come first (in pack order), then the rest
 * by creation date. Readiness reflects required docs (workflows) or connected
 * data sources (agents).
 */
export async function listRunItems(
  workspaceId: string,
  projectId: string,
): Promise<RunSidebarItem[]> {
  const [docs, workflows, agents, connections] = await Promise.all([
    listDocuments(workspaceId, "project", projectId, "file"),
    listWorkspaceWorkflows(workspaceId),
    listWorkspaceAgents(workspaceId),
    listConnections(workspaceId),
  ]);
  const connectedProviders = connectedProvidersFrom(connections);
  const presentDocTypes = new Set(
    docs.filter((d) => d.is_active && d.doc_type).map((d) => d.doc_type!),
  );

  const packOrder = (slug: string | null | undefined) => {
    const i = slug
      ? STARTER_PACK_SLUGS.indexOf(slug as (typeof STARTER_PACK_SLUGS)[number])
      : -1;
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };

  type Row = RunSidebarItem & { created_at: string; order: number };
  const rows: Row[] = [
    ...workflows
      .filter((w) => !w.archived_at)
      .map((w) => ({
        id: w.id,
        name: w.name,
        kind: "workflow" as const,
        ready: preflightWorkflow(w.library?.input_spec ?? null, docs).ready,
        created_at: w.created_at,
        order: packOrder(w.library?.slug),
      })),
    ...agents
      // Only recruiting-project agents belong in a project's Agents list;
      // others (e.g. business-development) are surfaced in their own context.
      .filter(
        (a) =>
          !a.archived_at &&
          (a.library?.context ?? "recruiting-project") === "recruiting-project",
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        kind: "agent" as const,
        ready:
          agentReady(
            agentRequirements(a.allowed_tools ?? [], connectedProviders),
          ) && requiredDocsPresent(a.library?.slug, presentDocTypes),
        created_at: a.created_at,
        order: packOrder(a.library?.slug),
      })),
  ].sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.created_at.localeCompare(b.created_at),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    ready: row.ready,
  }));
}
