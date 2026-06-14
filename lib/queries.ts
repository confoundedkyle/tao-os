import "server-only";
import { cache } from "react";
import { providerLabel } from "./ai-catalog";
import { db } from "./db";
import { env } from "./env";
import type {
  AgentRun,
  AiProvider,
  AtsCandidate,
  CatalogModel,
  Client,
  Connection,
  CrmAccount,
  CrmLead,
  Doc,
  DocKind,
  DocScope,
  LibraryAgent,
  LibraryWorkflow,
  ModuleKey,
  Project,
  TalentProspect,
  WorkflowRun,
  WorkspaceAgent,
  WorkspaceModule,
  WorkspaceWorkflow,
} from "./types";

export type CrmLeadWithAccount = CrmLead & {
  account: { id: string; name: string } | null;
};

export type AtsCandidateWithProject = AtsCandidate & {
  project:
    | { id: string; name: string; client: { id: string; name: string } | null }
    | null;
};

// All reads are scoped by workspace_id resolved from the session — never from
// the client (SPEC §9 tenant isolation rule).

export async function listClientsWithProjects(
  workspaceId: string,
): Promise<(Client & { projects: Project[] })[]> {
  const { data, error } = await db()
    .from("clients")
    .select("*, projects(*)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("is_demo", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    projects: ((c.projects ?? []) as Project[])
      // The demo project is hidden even if it ever lands under a real client.
      .filter((p) => p.status === "active" && !p.is_demo)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
  }));
}

export async function listClients(workspaceId: string): Promise<Client[]> {
  const { data, error } = await db()
    .from("clients")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_demo", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Client[];
}

export async function getClient(
  workspaceId: string,
  clientId: string,
): Promise<Client | null> {
  const { data } = await db()
    .from("clients")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", clientId)
    .maybeSingle();
  return data as Client | null;
}

export async function listProjects(
  workspaceId: string,
  clientId: string,
): Promise<Project[]> {
  const client = await getClient(workspaceId, clientId);
  if (!client) return [];
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function getProject(
  workspaceId: string,
  projectId: string,
): Promise<(Project & { client: Client }) | null> {
  const { data } = await db()
    .from("projects")
    .select("*, client:clients!inner(*)")
    .eq("id", projectId)
    .eq("client.workspace_id", workspaceId)
    .maybeSingle();
  return data as (Project & { client: Client }) | null;
}

export async function listDocuments(
  workspaceId: string,
  scopeType: DocScope,
  scopeId: string,
  kind?: DocKind,
): Promise<Doc[]> {
  let query = db()
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .order("created_at", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return data as Doc[];
}

export async function getDocument(
  workspaceId: string,
  docId: string,
): Promise<Doc | null> {
  const { data } = await db()
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", docId)
    .maybeSingle();
  return data as Doc | null;
}

export async function listLibraryWorkflows(): Promise<LibraryWorkflow[]> {
  const { data, error } = await db()
    .from("library_workflows")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as LibraryWorkflow[];
}

export async function getLibraryWorkflowBySlug(
  slug: string,
): Promise<LibraryWorkflow | null> {
  const { data } = await db()
    .from("library_workflows")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as LibraryWorkflow) ?? null;
}

export async function listWorkspaceWorkflows(
  workspaceId: string,
): Promise<(WorkspaceWorkflow & { library: LibraryWorkflow | null })[]> {
  const { data, error } = await db()
    .from("workspace_workflows")
    .select("*, library:library_workflows(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return data as (WorkspaceWorkflow & { library: LibraryWorkflow | null })[];
}

export async function getWorkspaceWorkflow(
  workspaceId: string,
  workflowId: string,
): Promise<(WorkspaceWorkflow & { library: LibraryWorkflow | null }) | null> {
  const { data } = await db()
    .from("workspace_workflows")
    .select("*, library:library_workflows(*)")
    .eq("workspace_id", workspaceId)
    .eq("id", workflowId)
    .maybeSingle();
  return data as
    | (WorkspaceWorkflow & { library: LibraryWorkflow | null })
    | null;
}

export async function listProviders(
  workspaceId: string,
): Promise<AiProvider[]> {
  const { data, error } = await db()
    .from("workspace_ai_providers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority");
  if (error) throw error;
  return data as AiProvider[];
}

/** Provider + model a run would use right now (first usable row by priority).
 *  Display-only — unlike resolveRunProviders it never decrypts API keys. */
export async function getPrimaryRunModel(
  workspaceId: string,
): Promise<{ providerLabel: string; modelId: string } | null> {
  const providers = await listProviders(workspaceId);
  for (const row of providers) {
    if (row.provider === "calyflow") {
      if (!env.platformProviderEnabled) continue;
      return {
        providerLabel: providerLabel(env.platformProvider),
        modelId: env.platformModel,
      };
    }
    if (!row.api_key_cipher || !row.default_model) continue;
    return {
      providerLabel: providerLabel(row.provider),
      modelId: row.default_model,
    };
  }
  return null;
}

export async function listCatalogModels(
  provider?: string,
): Promise<CatalogModel[]> {
  let query = db().from("model_catalog").select("*").order("model_id");
  if (provider) query = query.eq("provider", provider);
  const { data, error } = await query;
  if (error) throw error;
  return data as CatalogModel[];
}

export async function listRuns(
  workspaceId: string,
  projectId: string,
): Promise<(WorkflowRun & { workflow: { name: string } | null })[]> {
  const project = await getProject(workspaceId, projectId);
  if (!project) return [];
  const { data, error } = await db()
    .from("workflow_runs")
    .select("*, workflow:workspace_workflows(name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as (WorkflowRun & { workflow: { name: string } | null })[];
}

export async function getRun(
  workspaceId: string,
  runId: string,
): Promise<
  | (WorkflowRun & {
      workflow: { name: string } | null;
      project: Project & { client: Client };
    })
  | null
> {
  const { data } = await db()
    .from("workflow_runs")
    .select(
      "*, workflow:workspace_workflows(name), project:projects!inner(*, client:clients!inner(*))",
    )
    .eq("id", runId)
    .eq("project.client.workspace_id", workspaceId)
    .maybeSingle();
  return data as
    | (WorkflowRun & {
        workflow: { name: string } | null;
        project: Project & { client: Client };
      })
    | null;
}

export async function getAgentRun(
  workspaceId: string,
  runId: string,
): Promise<
  | (AgentRun & {
      agent: { name: string } | null;
      project: Project & { client: Client };
    })
  | null
> {
  const { data } = await db()
    .from("agent_runs")
    .select(
      "*, agent:workspace_agents(name), project:projects!inner(*, client:clients!inner(*))",
    )
    .eq("id", runId)
    .eq("project.client.workspace_id", workspaceId)
    .maybeSingle();
  return data as
    | (AgentRun & {
        agent: { name: string } | null;
        project: Project & { client: Client };
      })
    | null;
}

export async function listRecentRuns(
  workspaceId: string,
  limit = 8,
): Promise<
  (WorkflowRun & {
    workflow: { name: string } | null;
    project: { id: string; name: string } | null;
  })[]
> {
  const { data, error } = await db()
    .from("workflow_runs")
    .select(
      "*, workflow:workspace_workflows!inner(name, workspace_id), project:projects(id, name)",
    )
    .eq("workspace_workflows.workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as (WorkflowRun & {
    workflow: { name: string } | null;
    project: { id: string; name: string } | null;
  })[];
}

// --- Data-source connectors ---

export async function listConnections(
  workspaceId: string,
): Promise<Connection[]> {
  const { data, error } = await db()
    .from("workspace_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return data as Connection[];
}

export async function getConnection(
  workspaceId: string,
  provider: string,
): Promise<Connection | null> {
  const { data } = await db()
    .from("workspace_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  return data as Connection | null;
}

// --- Dynamic data agents ---

export async function listLibraryAgents(): Promise<LibraryAgent[]> {
  const { data, error } = await db()
    .from("library_agents")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as LibraryAgent[];
}

export async function getLibraryAgentBySlug(
  slug: string,
): Promise<LibraryAgent | null> {
  const { data } = await db()
    .from("library_agents")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as LibraryAgent) ?? null;
}

export async function listWorkspaceAgents(
  workspaceId: string,
): Promise<(WorkspaceAgent & { library: LibraryAgent | null })[]> {
  const { data, error } = await db()
    .from("workspace_agents")
    .select("*, library:library_agents(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return data as (WorkspaceAgent & { library: LibraryAgent | null })[];
}

export async function getWorkspaceAgent(
  workspaceId: string,
  agentId: string,
): Promise<WorkspaceAgent | null> {
  const { data } = await db()
    .from("workspace_agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", agentId)
    .maybeSingle();
  return data as WorkspaceAgent | null;
}

export async function listAgentRuns(
  workspaceId: string,
  projectId: string,
): Promise<(AgentRun & { agent: { name: string } | null })[]> {
  const project = await getProject(workspaceId, projectId);
  if (!project) return [];
  const { data, error } = await db()
    .from("agent_runs")
    .select("*, agent:workspace_agents(name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as (AgentRun & { agent: { name: string } | null })[];
}

export async function listRecentAgentRuns(
  workspaceId: string,
  limit = 8,
): Promise<
  (AgentRun & {
    agent: { name: string } | null;
    project: { id: string; name: string } | null;
  })[]
> {
  const { data, error } = await db()
    .from("agent_runs")
    .select(
      "*, agent:workspace_agents!inner(name, workspace_id), project:projects(id, name)",
    )
    .eq("workspace_agents.workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as (AgentRun & {
    agent: { name: string } | null;
    project: { id: string; name: string } | null;
  })[];
}

// --- Activatable workspace modules ---

export async function listModules(
  workspaceId: string,
): Promise<WorkspaceModule[]> {
  const { data, error } = await db()
    .from("workspace_modules")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return data as WorkspaceModule[];
}

/**
 * Module keys the workspace has switched on — drives the sidebar nav.
 * cache()-wrapped: the layout and module page guards both call this within
 * one request, so the result is shared instead of hitting the DB twice.
 */
export const listActiveModuleKeys = cache(
  async (workspaceId: string): Promise<ModuleKey[]> => {
    const { data, error } = await db()
      .from("workspace_modules")
      .select("module_key")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    // Tolerate the table not existing yet (migration 0007 not applied) so the
    // rest of the app keeps working — treat as no active modules.
    if (error) {
      if (error.code === "PGRST205") return [];
      throw error;
    }
    return (data ?? []).map((r) => r.module_key as ModuleKey);
  },
);

// --- CRM ---

export async function listAccounts(
  workspaceId: string,
): Promise<CrmAccount[]> {
  const { data, error } = await db()
    .from("crm_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CrmAccount[];
}

export async function getAccount(
  workspaceId: string,
  accountId: string,
): Promise<CrmAccount | null> {
  const { data } = await db()
    .from("crm_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", accountId)
    .maybeSingle();
  return data as CrmAccount | null;
}

export async function listLeads(
  workspaceId: string,
): Promise<CrmLeadWithAccount[]> {
  const { data, error } = await db()
    .from("crm_leads")
    .select("*, account:crm_accounts(id, name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CrmLeadWithAccount[];
}

export async function getLead(
  workspaceId: string,
  leadId: string,
): Promise<CrmLead | null> {
  const { data } = await db()
    .from("crm_leads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .maybeSingle();
  return data as CrmLead | null;
}

// --- ATS ---

export async function listCandidates(
  workspaceId: string,
): Promise<AtsCandidateWithProject[]> {
  const { data, error } = await db()
    .from("ats_candidates")
    .select("*, project:projects(id, name, client:clients(id, name))")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as AtsCandidateWithProject[];
}

export async function getCandidate(
  workspaceId: string,
  candidateId: string,
): Promise<AtsCandidate | null> {
  const { data } = await db()
    .from("ats_candidates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", candidateId)
    .maybeSingle();
  return data as AtsCandidate | null;
}

// --- Target Talent Pool ---

export async function listProspects(
  workspaceId: string,
): Promise<TalentProspect[]> {
  const { data, error } = await db()
    .from("talent_prospects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as TalentProspect[];
}

export async function getProspect(
  workspaceId: string,
  prospectId: string,
): Promise<TalentProspect | null> {
  const { data } = await db()
    .from("talent_prospects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", prospectId)
    .maybeSingle();
  return data as TalentProspect | null;
}

/** All-provider spend for the current calendar month (UTC), in USD —
 *  workflow runs and agent runs combined. */
export async function monthSpendUsd(workspaceId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();
  const [workflowSpend, agentSpend] = await Promise.all([
    db()
      .from("workflow_runs")
      .select("cost_usd, workspace_workflows!inner(workspace_id)")
      .eq("workspace_workflows.workspace_id", workspaceId)
      .gte("created_at", since),
    db()
      .from("agent_runs")
      .select("cost_usd, workspace_agents!inner(workspace_id)")
      .eq("workspace_agents.workspace_id", workspaceId)
      .gte("created_at", since),
  ]);
  if (workflowSpend.error) throw workflowSpend.error;
  // Tolerate agent_runs not existing yet (migration 0006 not applied) so the
  // rest of the app keeps working — count agent spend as 0 until it's there.
  if (agentSpend.error && agentSpend.error.code !== "PGRST205") {
    throw agentSpend.error;
  }
  const sum = (rows: { cost_usd: number | null }[] | null) =>
    (rows ?? []).reduce((acc, row) => acc + Number(row.cost_usd ?? 0), 0);
  return sum(workflowSpend.data) + sum(agentSpend.data);
}
