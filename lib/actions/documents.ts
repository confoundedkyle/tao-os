"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { extractTextFromFile } from "../extract";
import { getClient, getDocument, getProject, getProspect } from "../queries";
import type { DocKind, DocScope, DocType, Session } from "../types";

const DOC_TYPE_LABELS: Record<string, string> = {
  jd: "JD",
  intake_notes: "Intake notes",
  cv: "CV",
  scorecard: "Scorecard",
  note: "Note",
  other: "Document",
};

async function assertScope(
  session: Session,
  scopeType: DocScope,
  scopeId: string,
) {
  if (scopeType === "workspace") {
    if (scopeId !== session.workspaceId) throw new Error("Invalid scope");
  } else if (scopeType === "client") {
    if (!(await getClient(session.workspaceId, scopeId)))
      throw new Error("Client not found");
  } else if (scopeType === "prospect") {
    if (!(await getProspect(session.workspaceId, scopeId)))
      throw new Error("Prospect not found");
  } else {
    if (!(await getProject(session.workspaceId, scopeId)))
      throw new Error("Project not found");
  }
}

/** One active JD per project: pasting a new JD archives the old (SPEC §4). */
async function archivePreviousJd(scopeId: string) {
  await db()
    .from("documents")
    .update({ is_active: false })
    .eq("scope_type", "project")
    .eq("scope_id", scopeId)
    .eq("doc_type", "jd")
    .eq("is_active", true);
}

function autoFilename(docType: DocType | null, source: "pasted" | "upload") {
  const label = DOC_TYPE_LABELS[docType ?? "other"] ?? "Document";
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${label} – ${source} ${date}`;
}

/**
 * Supabase Storage rejects object keys with non-ASCII or special characters
 * (e.g. the em-dash in "CV Screener — 10 Jun.md"). Sanitise only the storage
 * key — the original `file.name` is kept verbatim in the `filename` column for
 * display. A UUID prefix guarantees uniqueness, so collisions aren't a concern.
 */
function storageSafeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "") // drop non-ASCII (dashes, accents, …)
      .replace(/[^a-zA-Z0-9._-]/g, "-") // conservative whitelist
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "file"
  );
}

function revalidateScope(scopeType: DocScope, scopeId: string) {
  // "layout" so the sub-tabs (/knowledge + /files) refresh too.
  if (scopeType === "workspace") revalidatePath("/knowledge", "layout");
  else if (scopeType === "client") revalidatePath(`/clients/${scopeId}`, "layout");
  else if (scopeType === "prospect") revalidatePath(`/talent-pool/${scopeId}`, "page");
  else revalidatePath(`/clients/[clientId]/projects/${scopeId}`, "page");
}

export async function createPastedDocumentAction(formData: FormData) {
  const session = await requireSession();
  const scopeType = String(formData.get("scopeType")) as DocScope;
  const scopeId = String(formData.get("scopeId"));
  const kind = (String(formData.get("kind") ?? "file") as DocKind) || "file";
  const docType = (String(formData.get("docType") ?? "other") ||
    "other") as DocType;
  const text = String(formData.get("text") ?? "").trim();
  const filename = String(formData.get("filename") ?? "").trim();
  if (!text) throw new Error("Paste some text first");

  await assertScope(session, scopeType, scopeId);
  if (scopeType === "project" && docType === "jd") {
    await archivePreviousJd(scopeId);
  }
  const { error } = await db().from("documents").insert({
    scope_type: scopeType,
    scope_id: scopeId,
    workspace_id: session.workspaceId,
    kind,
    doc_type: docType,
    source: "pasted",
    filename: filename || autoFilename(docType, "pasted"),
    extracted_text: text,
    created_by: session.userId,
  });
  if (error) throw error;
  revalidateScope(scopeType, scopeId);
}

export async function uploadDocumentAction(formData: FormData) {
  const session = await requireSession();
  const scopeType = String(formData.get("scopeType")) as DocScope;
  const scopeId = String(formData.get("scopeId"));
  const kind = (String(formData.get("kind") ?? "file") as DocKind) || "file";
  const docType = (String(formData.get("docType") ?? "other") ||
    "other") as DocType;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Choose a file first");
  if (file.size > 20 * 1024 * 1024) throw new Error("File too large (20 MB max)");

  await assertScope(session, scopeType, scopeId);
  const extractedText = await extractTextFromFile(file);

  const storagePath = `${session.workspaceId}/${scopeType}/${scopeId}/${randomUUID()}-${storageSafeName(file.name)}`;
  const { error: uploadError } = await db()
    .storage.from("documents")
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) throw uploadError;

  if (scopeType === "project" && docType === "jd") {
    await archivePreviousJd(scopeId);
  }
  const { error } = await db().from("documents").insert({
    scope_type: scopeType,
    scope_id: scopeId,
    workspace_id: session.workspaceId,
    kind,
    doc_type: docType,
    source: "upload",
    filename: file.name,
    storage_path: storagePath,
    extracted_text: extractedText,
    created_by: session.userId,
  });
  if (error) throw error;
  revalidateScope(scopeType, scopeId);
}

/** Client KB is a single free-text notes doc in V1 (SPEC §4 matrix). */
export async function saveClientKbAction(formData: FormData) {
  const session = await requireSession();
  const clientId = String(formData.get("clientId"));
  const text = String(formData.get("text") ?? "").trim();
  const client = await getClient(session.workspaceId, clientId);
  if (!client) throw new Error("Client not found");

  const { data: existing } = await db()
    .from("documents")
    .select("id")
    .eq("workspace_id", session.workspaceId)
    .eq("scope_type", "client")
    .eq("scope_id", clientId)
    .eq("kind", "kb")
    .maybeSingle();

  if (existing) {
    const { error } = await db()
      .from("documents")
      .update({ extracted_text: text })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await db().from("documents").insert({
      scope_type: "client",
      scope_id: clientId,
      workspace_id: session.workspaceId,
      kind: "kb",
      doc_type: "note",
      source: "pasted",
      filename: `${client.name} — client notes`,
      extracted_text: text,
      created_by: session.userId,
    });
    if (error) throw error;
  }
  revalidatePath(`/clients/${clientId}`, "layout");
}

/** Upload a CV and return its ID so the caller can immediately trigger a run. */
const RUN_INPUT_DOC_TYPES: DocType[] = [
  "cv",
  "intake_notes",
  "note",
  "scorecard",
  "other",
];

/** Upload a per-run input document (CV, intake notes, …) and return its id. */
export async function uploadInputForRunAction(
  formData: FormData,
): Promise<{ docId: string }> {
  const session = await requireSession();
  const scopeId = String(formData.get("scopeId"));
  if (!(await getProject(session.workspaceId, scopeId)))
    throw new Error("Project not found");

  const requested = String(formData.get("docType") ?? "other") as DocType;
  const docType = RUN_INPUT_DOC_TYPES.includes(requested) ? requested : "other";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Choose a file first");
  if (file.size > 20 * 1024 * 1024) throw new Error("File too large (20 MB max)");

  const extractedText = await extractTextFromFile(file);
  const storagePath = `${session.workspaceId}/project/${scopeId}/${randomUUID()}-${storageSafeName(file.name)}`;
  const { error: uploadError } = await db()
    .storage.from("documents")
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) throw uploadError;

  const id = randomUUID();
  const { error } = await db().from("documents").insert({
    id,
    scope_type: "project",
    scope_id: scopeId,
    workspace_id: session.workspaceId,
    kind: "file",
    doc_type: docType,
    source: "upload",
    filename: file.name,
    storage_path: storagePath,
    extracted_text: extractedText,
    created_by: session.userId,
  });
  if (error) throw error;
  revalidateScope("project", scopeId);
  return { docId: id };
}

/** Markdown/plain-text docs are editable; binary uploads (PDF, DOCX) are not. */
function isMarkdownEditable(doc: {
  storage_path: string | null;
  filename: string | null;
}): boolean {
  if (!doc.storage_path) return true; // pasted or app-created note
  const name = (doc.filename ?? "").toLowerCase();
  return (
    name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")
  );
}

/** Rename a document's display name. The storage object key is left untouched
 *  (it's a UUID-prefixed key, decoupled from the user-facing filename). */
export async function renameDocumentAction(docId: string, filename: string) {
  const session = await requireSession();
  const doc = await getDocument(session.workspaceId, docId);
  if (!doc) throw new Error("Document not found");
  const trimmed = filename.trim();
  if (!trimmed) throw new Error("Name is required");
  const { error } = await db()
    .from("documents")
    .update({ filename: trimmed })
    .eq("id", docId);
  if (error) throw error;
  revalidateScope(doc.scope_type, doc.scope_id);
}

export async function updateDocumentTextAction(docId: string, text: string) {
  const session = await requireSession();
  const doc = await getDocument(session.workspaceId, docId);
  if (!doc) throw new Error("Document not found");
  if (!isMarkdownEditable(doc))
    throw new Error("Only markdown files can be edited");
  const { error } = await db()
    .from("documents")
    .update({ extracted_text: text })
    .eq("id", docId);
  if (error) throw error;
  revalidateScope(doc.scope_type, doc.scope_id);
}

/** Creates an empty markdown note in a client or workspace KB and returns its
 *  id so the UI can open it in edit mode straight away. */
export async function createKbNoteAction(
  scopeType: "client" | "workspace",
  scopeId: string,
): Promise<{ docId: string }> {
  const session = await requireSession();
  await assertScope(session, scopeType, scopeId);
  const id = randomUUID();
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const { error } = await db().from("documents").insert({
    id,
    scope_type: scopeType,
    scope_id: scopeId,
    workspace_id: session.workspaceId,
    kind: "kb",
    doc_type: "note",
    source: "pasted",
    filename: `Notes – ${date}.md`,
    extracted_text: "",
    created_by: session.userId,
  });
  if (error) throw error;
  revalidateScope(scopeType, scopeId);
  return { docId: id };
}

export async function deleteDocumentAction(docId: string) {
  const session = await requireSession();
  const doc = await getDocument(session.workspaceId, docId);
  if (!doc) throw new Error("Document not found");
  if (doc.storage_path) {
    await db().storage.from("documents").remove([doc.storage_path]);
  }
  // Output docs may be referenced by runs; detach before deleting.
  await db()
    .from("workflow_runs")
    .update({ output_doc_id: null })
    .eq("output_doc_id", docId);
  const { error } = await db().from("documents").delete().eq("id", docId);
  if (error) throw error;
  revalidateScope(doc.scope_type, doc.scope_id);
}

export async function setDocumentActiveAction(docId: string, active: boolean) {
  const session = await requireSession();
  const doc = await getDocument(session.workspaceId, docId);
  if (!doc) throw new Error("Document not found");
  if (active && doc.scope_type === "project" && doc.doc_type === "jd") {
    await archivePreviousJd(doc.scope_id);
  }
  const { error } = await db()
    .from("documents")
    .update({ is_active: active })
    .eq("id", docId);
  if (error) throw error;
  revalidateScope(doc.scope_type, doc.scope_id);
}
