"use client";

import { useState, useTransition } from "react";
import {
  createPastedDocumentAction,
  importDocumentFromUrlAction,
  uploadDocumentAction,
} from "@/lib/actions/documents";
import { Button, inputClass } from "./ui";

export const TYPE_LABELS: Record<string, string> = {
  jd: "Job Description",
  intake_notes: "Intake Notes",
  cv: "CV",
  scorecard: "Scorecard",
  other: "Other",
};

export function UploadForm({
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
  const [mode, setMode] = useState<"paste" | "upload" | "url">("paste");
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
          aria-pressed={mode === "paste"}
          onClick={() => setMode("paste")}
          className={mode === "paste" ? "text-mint-700 underline underline-offset-4" : "text-navy-800/50"}
        >
          Paste text
        </button>
        <button
          type="button"
          aria-pressed={mode === "upload"}
          onClick={() => setMode("upload")}
          className={mode === "upload" ? "text-mint-700 underline underline-offset-4" : "text-navy-800/50"}
        >
          Upload file
        </button>
        <button
          type="button"
          aria-pressed={mode === "url"}
          onClick={() => setMode("url")}
          className={mode === "url" ? "text-mint-700 underline underline-offset-4" : "text-navy-800/50"}
        >
          Import from URL
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
      ) : mode === "upload" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(uploadDocumentAction, e.currentTarget);
          }}
        >
          {/* Picking a file uploads it straight away — no second click. */}
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-chip px-4 py-2 text-sm font-semibold transition ${
              pending
                ? "cursor-default bg-mint-400/50 text-navy-800/60"
                : "bg-mint-400 text-navy-800 hover:bg-mint-400/80"
            }`}
          >
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.docx,.txt,.md"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const name = e.target.files?.[0]?.name ?? null;
                setFileLabel(name);
                if (name) submit(uploadDocumentAction, e.currentTarget.form!);
              }}
            />
            {pending
              ? `Uploading${fileLabel ? ` ${fileLabel}` : ""}…`
              : `Choose ${label} file…`}
          </label>
          <p className="mt-2 text-xs text-navy-800/40">
            PDF, DOCX, TXT, MD · 20 MB max
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(importDocumentFromUrlAction, e.currentTarget);
          }}
          className="space-y-3"
        >
          <input
            name="url"
            type="url"
            required
            placeholder="https://… (job post, LinkedIn, Google Doc)"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="filename"
              placeholder="Name (optional — auto-named if blank)"
              className={`${inputClass} max-w-72 !py-1.5 text-sm`}
            />
            <Button variant="small" type="submit" disabled={pending}>
              {pending ? "Importing…" : `Import ${label}`}
            </Button>
          </div>
          <p className="mt-2 text-xs text-navy-800/40">
            We read the page text and save it as {label}.
          </p>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-coral-400">{error}</p>}
    </div>
  );
}

export function AddDocument({
  scopeType,
  scopeId,
  kind = "file",
  docTypes = ["other"],
  compact = false,
}: {
  scopeType: "workspace" | "client" | "project" | "prospect";
  scopeId: string;
  kind?: "kb" | "file";
  docTypes?: string[];
  compact?: boolean;
}) {
  const [docType, setDocType] = useState(docTypes[0]);

  // Single type or doc-type chooser → inline form. The grouped slot UI for
  // project files now lives in ProjectFilesManager.
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
