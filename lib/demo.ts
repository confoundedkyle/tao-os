import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "./db";
import { getLibraryWorkflowBySlug } from "./queries";
import type { Doc } from "./types";

/**
 * Provisions (idempotently) the per-workspace scaffolding the /demo page needs
 * to run the real CV Screener workflow end to end:
 *   - a hidden demo client + project (is_demo, so they stay out of normal lists)
 *   - the CV Screener workflow imported into the workspace (if absent)
 *   - a default Job Description as the project's active `jd` file
 *   - three sample CVs as project `cv` files
 *
 * Everything is reused by the live run pipeline (`POST /api/runs`), so the demo
 * is the real product, not a mock. Safe to call on every page load.
 */

const DEMO_CLIENT_NAME = "Calyflow Demo";
const DEMO_PROJECT_NAME = "CV Screener Demo";
const CV_SCREENER_SLUG = "cv-screener";

const DEMO_JD = { file: "job-description.md", filename: "Senior Backend Engineer — JD.md" };
const DEMO_CVS = [
  { file: "cv-priya-sharma.md", filename: "Priya Sharma — CV.md" },
  { file: "cv-marcus-bell.md", filename: "Marcus Bell — CV.md" },
  { file: "cv-jenna-okafor.md", filename: "Jenna Okafor — CV.md" },
];

function readDemoFile(file: string): string {
  return readFileSync(join(process.cwd(), "data", "demo", file), "utf8");
}

export interface DemoContext {
  projectId: string;
  workflowId: string;
  jd: { id: string; filename: string };
  cvs: { id: string; filename: string }[];
}

export async function ensureDemoProject(
  workspaceId: string,
  userId: string | null,
): Promise<DemoContext> {
  const clientId = await ensureDemoClient(workspaceId);
  const projectId = await ensureDemoProjectRow(workspaceId, clientId);
  const workflowId = await ensureCvScreenerWorkflow(workspaceId);

  const existing = (await db()
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("scope_type", "project")
    .eq("scope_id", projectId)) as { data: Doc[] | null };
  const docs = existing.data ?? [];

  const jd = await ensureDoc(workspaceId, projectId, userId, docs, {
    docType: "jd",
    file: DEMO_JD.file,
    filename: DEMO_JD.filename,
    isActive: true,
  });

  const cvs: { id: string; filename: string }[] = [];
  for (const cv of DEMO_CVS) {
    const doc = await ensureDoc(workspaceId, projectId, userId, docs, {
      docType: "cv",
      file: cv.file,
      filename: cv.filename,
      isActive: false,
    });
    cvs.push(doc);
  }

  return { projectId, workflowId, jd, cvs };
}

async function ensureDemoClient(workspaceId: string): Promise<string> {
  const { data: existing } = await db()
    .from("clients")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db()
    .from("clients")
    .insert({ workspace_id: workspaceId, name: DEMO_CLIENT_NAME, is_demo: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function ensureDemoProjectRow(
  workspaceId: string,
  clientId: string,
): Promise<string> {
  const { data: existing } = await db()
    .from("projects")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db()
    .from("projects")
    .insert({ client_id: clientId, name: DEMO_PROJECT_NAME, is_demo: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Find the workspace's CV Screener copy, importing a snapshot if none exists. */
async function ensureCvScreenerWorkflow(workspaceId: string): Promise<string> {
  const library = await getLibraryWorkflowBySlug(CV_SCREENER_SLUG);
  if (!library) throw new Error("CV Screener is not in the workflow library");

  const { data: existing } = await db()
    .from("workspace_workflows")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("library_workflow_id", library.id)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db()
    .from("workspace_workflows")
    .insert({
      workspace_id: workspaceId,
      library_workflow_id: library.id,
      name: library.name,
      prompt_template: library.prompt_template,
      imported_version: library.version,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function ensureDoc(
  workspaceId: string,
  projectId: string,
  userId: string | null,
  existingDocs: Doc[],
  spec: { docType: "jd" | "cv"; file: string; filename: string; isActive: boolean },
): Promise<{ id: string; filename: string }> {
  const match = existingDocs.find(
    (d) => d.doc_type === spec.docType && d.filename === spec.filename,
  );
  if (match) return { id: match.id, filename: match.filename ?? spec.filename };

  const { data, error } = await db()
    .from("documents")
    .insert({
      scope_type: "project",
      scope_id: projectId,
      workspace_id: workspaceId,
      kind: "file",
      doc_type: spec.docType,
      source: "pasted",
      filename: spec.filename,
      extracted_text: readDemoFile(spec.file),
      is_active: spec.isActive,
      created_by: userId,
    })
    .select("id, filename")
    .single();
  if (error) throw error;
  return { id: data.id as string, filename: data.filename as string };
}
