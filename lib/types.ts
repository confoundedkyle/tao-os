export type WorkspaceType = "independent" | "agency" | "inhouse";

export interface Workspace {
  id: string;
  clerk_org_id: string;
  name: string;
  workspace_type: WorkspaceType | null;
  trial_ends_at: string | null;
  one_time_platform_credit_usd: number | null;
  one_time_platform_credit_spent_usd: number;
  monthly_spend_limit_usd: number | null;
  created_at: string;
}

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  status: "active" | "archived";
  created_at: string;
}

export type DocScope = "workspace" | "client" | "project";
export type DocKind = "kb" | "file";
export type DocType = "jd" | "intake_notes" | "cv" | "scorecard" | "note" | "output" | "other";

export interface Doc {
  id: string;
  scope_type: DocScope;
  scope_id: string;
  workspace_id: string;
  kind: DocKind;
  doc_type: DocType | null;
  source: "upload" | "pasted" | "workflow" | null;
  filename: string | null;
  storage_path: string | null;
  extracted_text: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface InputSpec {
  inputs: string[];
  /** doc_types that must exist as active project files before a run. */
  required_doc_types?: string[];
  /** doc_types the user picks as run inputs (e.g. ['cv']). Empty = no picker. */
  input_doc_types?: string[];
}

export interface LibraryWorkflow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  prompt_template: string;
  input_spec: InputSpec;
  output_spec: { output: string };
  version: number;
}

export interface WorkspaceWorkflow {
  id: string;
  workspace_id: string;
  library_workflow_id: string | null;
  name: string;
  prompt_template: string;
  imported_version: number | null;
  created_at: string;
}

export interface AiProvider {
  id: string;
  workspace_id: string;
  provider: string;
  api_key_cipher: string | null;
  key_last4: string | null;
  default_model: string | null;
  priority: number;
  status: "unverified" | "valid" | "invalid";
  last_validated_at: string | null;
}

export interface CatalogModel {
  provider: string;
  model_id: string;
  display_name: string;
  context_window: number | null;
  pricing: { input?: number; output?: number; cache_read?: number } | null;
  curated: boolean;
}

export interface WorkflowRun {
  id: string;
  project_id: string;
  workspace_workflow_id: string;
  status: "running" | "succeeded" | "failed";
  input_doc_ids: string[] | null;
  input_text: string | null;
  output_doc_id: string | null;
  rendered_prompt: string | null;
  context_notes: string[] | null;
  error_message: string | null;
  provider: string | null;
  model: string | null;
  fallback_used: boolean;
  model_response: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cost_usd: number | null;
  created_by: string | null;
  created_at: string;
}

export interface Session {
  userId: string;
  workspaceId: string;
  role: "admin" | "member";
  workspace: Workspace;
}
