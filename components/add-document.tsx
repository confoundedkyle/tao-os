"use client";

import { useState, useTransition } from "react";
import {
  createPastedDocumentAction,
  uploadDocumentAction,
} from "@/lib/actions/documents";
import type { Doc } from "@/lib/types";
import { Button, inputClass } from "./ui";

const TYPE_LABELS: Record<string, string> = {
  jd: "Job Description",
  intake_notes: "Intake Notes",
  cv: "CV",
  scorecard: "Scorecard",
  other: "Other",
};

function UploadForm({
  scopeType,
  scopeId,
  kind,
  docType,
  compact,
  onDone,
}: {
  scopeType: string;
  scopeId: string;
  kind: string;
  docType: string;
  compact: boolean;
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(action: (fd: FormData) => Promise<void>, form: HTMLFormElement) {
    const formData = new FormData(form);
    formData.set("scopeType", scopeType);
    formData.set("scopeId", scopeId);
    formData.set("kind", kind);
    formData.set("docType", docType);
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        form.reset();
        setFileLabel(null);
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const label = TYPE_LABELS[docType] ?? docType;

  return (
    <div>
      <div className="mb-3 flex gap-4 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={mode === "paste" ? "text-mint-700 underline underline-offset-4" : "text-navy-800/50"}
        >
          Paste text
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={mode === "upload" ? "text-mint-700 underline underline-offset-4" : "text-navy-800/50"}
        >
          Upload file
        </button>
      </div>

      {mode === "paste" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(createPastedDocumentAction, e.currentTarget);
          }}
          className="space-y-3"
        >
          <textarea
            name="text"
            required
            rows={compact ? 4 : 8}
            placeholder="Paste from an email, LinkedIn, your notes…"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="filename"
              placeholder="Name (optional — auto-named if blank)"
              className={`${inputClass} max-w-72 !py-1.5 text-sm`}
            />
            <Button variant="small" type="submit" disabled={pending}>
              {pending ? "Saving…" : `Save ${label}`}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(uploadDocumentAction, e.currentTarget);
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-chip px-4 py-2 text-sm font-semibold transition ${
                fileLabel
                  ? "border border-navy-800/20 bg-cream-100 text-navy-800 hover:border-navy-800/50"
                  : "bg-mint-400 text-navy-800 hover:bg-mint-400/80"
              }`}
            >
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.docx,.txt,.md"
                className="sr-only"
                onChange={(e) =>
                  setFileLabel(e.target.files?.[0]?.name ?? null)
                }
              />
              {fileLabel ? `📄 ${fileLabel}` : `Choose ${label} file…`}
            </label>
            <Button variant="small" type="submit" disabled={pending || !fileLabel}>
              {pending ? "Uploading…" : `Upload ${label}`}
            </Button>
          </div>
          <p className="mt-2 text-xs text-navy-800/40">
            PDF, DOCX, TXT, MD · 20 MB max
          </p>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-coral-400">{error}</p>}
    </div>
  );
}

function SlottedDocTypes({
  scopeType,
  scopeId,
  kind,
  docTypes,
  existingDocs,
  compact,
}: {
  scopeType: string;
  scopeId: string;
  kind: string;
  docTypes: string[];
  existingDocs: Doc[];
  compact: boolean;
}) {
  const [openType, setOpenType] = useState<string | null>(null);

  const countFor = (t: string) =>
    existingDocs.filter((d) => d.doc_type === t && d.is_active).length;

  return (
    <div className="divide-y divide-navy-800/8">
      {docTypes.map((t) => {
        const count = countFor(t);
        const filled = count > 0;
        const isOpen = openType === t;
        const label = TYPE_LABELS[t] ?? t;

        return (
          <div key={t} className="py-3">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  filled
                    ? "bg-mint-400/30 text-mint-700"
                    : "border border-navy-800/20 text-navy-800/30"
                }`}
              >
                {filled ? "✓" : ""}
              </span>
              <span className={`flex-1 text-sm font-semibold ${filled ? "text-navy-900" : "text-navy-800/55"}`}>
                {label}
                {t === "cv" && count > 0 && (
                  <span className="ml-1.5 font-normal text-navy-800/45">
                    ({count})
                  </span>
                )}
                {!filled && (
                  <span className="ml-2 text-xs font-normal text-amber-400">
                    missing
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOpenType(isOpen ? null : t)}
                className="rounded-chip border border-navy-800/20 px-3 py-1 text-xs font-semibold text-navy-800/60 transition hover:border-mint-700 hover:text-mint-700"
              >
                {isOpen ? "Cancel" : filled && t !== "cv" ? "Replace" : "Add"}
              </button>
            </div>

            {isOpen && (
              <div className="mt-3 rounded-lg border border-navy-800/10 bg-cream-50 p-4">
                <UploadForm
                  scopeType={scopeType}
                  scopeId={scopeId}
                  kind={kind}
                  docType={t}
                  compact={compact}
                  onDone={() => setOpenType(null)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AddDocument({
  scopeType,
  scopeId,
  kind = "file",
  docTypes = ["other"],
  compact = false,
  existingDocs,
}: {
  scopeType: "workspace" | "client" | "project";
  scopeId: string;
  kind?: "kb" | "file";
  docTypes?: string[];
  compact?: boolean;
  existingDocs?: Doc[];
}) {
  const [docType, setDocType] = useState(docTypes[0]);

  // Multi-type with known existing docs → slot UI
  if (docTypes.length > 1 && existingDocs) {
    return (
      <SlottedDocTypes
        scopeType={scopeType}
        scopeId={scopeId}
        kind={kind}
        docTypes={docTypes}
        existingDocs={existingDocs}
        compact={compact}
      />
    );
  }

  // Single type or no doc context → original inline form
  return (
    <div>
      {docTypes.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {docTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDocType(t)}
              className={`rounded-chip px-4 py-2 text-sm font-semibold transition ${
                docType === t
                  ? "bg-mint-400 text-navy-800"
                  : "border border-navy-800/20 text-navy-800/70 hover:border-navy-800/50"
              }`}
            >
              {TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}
      <UploadForm
        scopeType={scopeType}
        scopeId={scopeId}
        kind={kind}
        docType={docType}
        compact={compact}
      />
    </div>
  );
}
