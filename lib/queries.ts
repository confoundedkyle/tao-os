import "server-only";
import { db } from "./db";
import type {
  AgentRun,
  AiProvider,
  CatalogModel,
  Client,
  Connection,
  Doc,
  DocKind,
  DocScope,
  LibraryAgent,
  LibraryWorkflow,
  Project,
  WorkflowRun,
  WorkspaceAgent,
  WorkspaceWorkflow,
} from "./types";

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
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    projects: ((c.projects ?? []) as Project[])
      .filter((p) => p.status === "active")
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

export async function listWorkspaceAgents(
  workspaceId: string,
): Promise<WorkspaceAgent[]> {
  const { data, error } = await db()
    .from("workspace_agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return data as WorkspaceAgent[];
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
