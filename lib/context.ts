import "server-only";
import { listDocuments } from "./queries";
import type { Client, Doc, Project } from "./types";

// Context injection — SPEC §5. Assembled stable → volatile (prompt-caching
// friendly): workspace KB → client KB → client files → project files →
// selected input docs. MVP concatenates full text with per-scope caps,
// truncating oldest-first with a visible note in the run log.

const WORKSPACE_KB_TOKEN_CAP = 8_000;
const PROJECT_FILES_TOKEN_CAP = 15_000;
const CHARS_PER_TOKEN = 4;

export interface AssembledContext {
  workspaceKb: string;
  clientKb: string;
  clientFiles: string;
  projectFiles: string;
  inputDocuments: string;
  notes: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function docBlock(doc: Doc): string {
  return `### ${doc.filename ?? "Untitled"}\n${doc.extracted_text ?? ""}`;
}

/**
 * Concatenates docs under a token cap. Newest docs are kept whole; the
 * oldest overflowing doc is trimmed, anything older is dropped.
 */
function concatWithCap(
  docs: Doc[],
  cap: number | null,
  scopeLabel: string,
  notes: string[],
): string {
  const active = docs.filter((d) => d.is_active && d.extracted_text);
  if (active.length === 0) return "";
  if (cap === null) return active.map(docBlock).join("\n\n");

  const newestFirst = [...active].reverse();
  const kept: string[] = [];
  let budget = cap * CHARS_PER_TOKEN;
  for (const doc of newestFirst) {
    const block = docBlock(doc);
    if (block.length <= budget) {
      kept.unshift(block);
      budget -= block.length;
    } else if (budget > 500) {
      kept.unshift(`${block.slice(0, budget)}\n[…truncated]`);
      notes.push(
        `${scopeLabel}: "${doc.filename}" was truncated to fit the ~${cap.toLocaleString()}-token cap (oldest-first).`,
      );
      budget = 0;
    } else {
      notes.push(
        `${scopeLabel}: "${doc.filename}" was omitted — over the ~${cap.toLocaleString()}-token cap (oldest-first).`,
      );
    }
  }
  return kept.join("\n\n");
}

export async function assembleContext(
  workspaceId: string,
  project: Project & { client: Client },
  inputDocs: Doc[],
): Promise<AssembledContext> {
  const notes: string[] = [];
  const inputIds = new Set(inputDocs.map((d) => d.id));

  const [workspaceDocs, clientKbDocs, clientFileDocs, projectDocs] =
    await Promise.all([
      listDocuments(workspaceId, "workspace", workspaceId, "kb"),
      listDocuments(workspaceId, "client", project.client.id, "kb"),
      listDocuments(workspaceId, "client", project.client.id, "file"),
      listDocuments(workspaceId, "project", project.id, "file"),
    ]);

  // CVs enter runs explicitly as selected inputs ("Run screener = pick
  // CV(s)"); leaving unselected CVs out of project context keeps one
  // candidate's screen from leaking into another's.
  const projectContextDocs = projectDocs.filter(
    (d) => !inputIds.has(d.id) && d.doc_type !== "cv",
  );

  const workspaceKb = concatWithCap(
    workspaceDocs,
    WORKSPACE_KB_TOKEN_CAP,
    "Workspace KB",
    notes,
  );
  const clientKb = concatWithCap(clientKbDocs, null, "Client KB", notes);
  const clientFiles = concatWithCap(clientFileDocs, null, "Client files", notes);
  const projectFiles = concatWithCap(
    projectContextDocs,
    PROJECT_FILES_TOKEN_CAP,
    "Project files",
    notes,
  );
  const inputDocuments = inputDocs
    .map((d) => `## ${d.filename ?? "Untitled"}\n${d.extracted_text ?? ""}`)
    .join("\n\n");

  return { workspaceKb, clientKb, clientFiles, projectFiles, inputDocuments, notes };
}

/** Fills known {{placeholders}}; unknown ones (model-facing) are left as-is. */
export function renderPrompt(
  template: string,
  context: AssembledContext,
): string {
  const values: Record<string, string> = {
    workspace_kb: context.workspaceKb,
    client_kb: context.clientKb,
    client_files: context.clientFiles,
    project_files: context.projectFiles,
    input_document: context.inputDocuments,
    input_documents: context.inputDocuments,
    today: new Date().toISOString().slice(0, 10),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

export function estimatePromptTokens(prompt: string): number {
  return estimateTokens(prompt);
}
