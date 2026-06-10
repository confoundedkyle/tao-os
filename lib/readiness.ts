import type { Doc, InputSpec } from "./types";

// Pre-run checks happen in app code BEFORE spending tokens, using doc_type
// (SPEC §5). The same logic feeds the project readiness checklist and the
// disabled-Run-button reasons.

export const DOC_TYPE_LABELS: Record<string, string> = {
  jd: "Job description",
  intake_notes: "Intake notes",
  cv: "CV",
  scorecard: "Scorecard",
  note: "Note",
  output: "Workflow output",
  other: "Other",
};

export function activeOfType(docs: Doc[], docType: string): Doc[] {
  return docs.filter(
    (d) => d.kind === "file" && d.doc_type === docType && d.is_active,
  );
}

export interface PreflightResult {
  ready: boolean;
  missing: string[]; // human-readable, e.g. "Add a Job description first"
  needsInputPicker: boolean;
  inputDocTypes: string[];
}

export function preflightWorkflow(
  inputSpec: InputSpec | null,
  projectDocs: Doc[],
): PreflightResult {
  const required = inputSpec?.required_doc_types ?? [];
  const inputTypes = inputSpec?.input_doc_types ?? [];
  const missing: string[] = [];

  for (const docType of required) {
    if (activeOfType(projectDocs, docType).length === 0) {
      missing.push(`Add a ${DOC_TYPE_LABELS[docType] ?? docType} first`);
    }
  }
  // The per-run input (e.g. a CV) is uploaded/picked at run time in the run
  // panel — it must NOT gate project readiness, or the panel would be hidden
  // before the user ever gets to choose a file. The run route separately
  // requires a selected input doc before spending tokens.
  const needsInputPicker = inputTypes.length > 0;
  return {
    ready: missing.length === 0,
    missing,
    needsInputPicker,
    inputDocTypes: inputTypes,
  };
}
