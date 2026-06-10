"use client";

import { useState, useTransition } from "react";
import {
  createPastedDocumentAction,
  uploadDocumentAction,
} from "@/lib/actions/documents";
import { Button, inputClass } from "./ui";

const TYPE_BUTTONS: Record<string, string> = {
  jd: "Job Description",
  intake_notes: "Intake Notes",
  cv: "CV",
  other: "Other",
};

export function AddDocument({
  scopeType,
  scopeId,
  kind = "file",
  docTypes = ["other"],
  compact = false,
}: {
  scopeType: "workspace" | "client" | "project";
  scopeId: string;
  kind?: "kb" | "file";
  docTypes?: string[];
  compact?: boolean;
}) {
  const [docType, setDocType] = useState(docTypes[0]);
  const [mode, setMode] = useState<"paste" | "upload">("paste");
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

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
              {TYPE_BUTTONS[t] ?? t}
            </button>
          ))}
        </div>
      )}

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
              {pending ? "Saving…" : "Save document"}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(uploadDocumentAction, e.currentTarget);
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.docx,.txt,.md"
            className="text-sm file:mr-3 file:rounded-chip file:border-0 file:bg-cream-100 file:px-4 file:py-2 file:font-semibold file:text-navy-800"
          />
          <Button variant="small" type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
          <span className="text-sm text-navy-800/45">PDF, DOCX, TXT, MD · 20 MB max</span>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-coral-400">{error}</p>}
    </div>
  );
}
