"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { uploadInputForRunAction } from "@/lib/actions/documents";
import { previewRunPromptAction } from "@/lib/actions/runs";
import { DownloadButtons } from "./download-buttons";
import { Button } from "./ui";

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: "CV",
  intake_notes: "Intake notes",
  note: "Note",
  scorecard: "Scorecard",
  jd: "Job description",
  output: "Output",
  other: "File",
};

/** Turns a readiness string ("Add a Job description first") into a bare
 *  checklist label ("Job description") — the surrounding UI conveys the action. */
function cleanMissingLabel(item: string): string {
  return item
    .replace(/^Add an? /i, "")
    .replace(/ first$/i, "")
    .trim();
}

export interface RunPanelWorkflow {
  id: string;
  name: string;
  ready: boolean;
  missing: string[];
  needsInputPicker: boolean;
  inputDocTypes: string[];
}

export interface RunPanelDoc {
  id: string;
  filename: string;
  docType: string | null;
  source: string | null;
}

export function RunPanel({
  projectId,
  workflows,
  inputCandidates,
  blockedMessage,
  adminHref,
}: {
  projectId: string;
  workflows: RunPanelWorkflow[];
  inputCandidates: RunPanelDoc[];
  blockedMessage: string | null;
  adminHref: string;
}) {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const workflow = useMemo(
    () => workflows.find((w) => w.id === workflowId),
    [workflows, workflowId],
  );

  // The doc type a freshly uploaded input gets tagged as (first accepted type).
  const primaryInputType = workflow?.inputDocTypes[0] ?? "other";
  const inputLabel = DOC_TYPE_LABELS[primaryInputType] ?? "File";

  const inputCandidatesForWorkflow = useMemo(
    () =>
      workflow
        ? inputCandidates.filter((d) =>
            d.docType ? workflow.inputDocTypes.includes(d.docType) : false,
          )
        : [],
    [inputCandidates, workflow],
  );
  const attachedExisting = inputCandidatesForWorkflow.filter((d) =>
    existingIds.includes(d.id),
  );
  const availableExisting = inputCandidatesForWorkflow.filter(
    (d) => !existingIds.includes(d.id),
  );

  const setupBlocked = blockedMessage
    ? blockedMessage
    : !workflow
      ? "Import a workflow first"
      : !workflow.ready
        ? workflow.missing.join(" · ")
        : null;

  // Missing required docs render as a checklist (each is a distinct action)
  // pointing at the Admin tab; other blockers stay a single inline message.
  const missingDocs =
    !blockedMessage && workflow && !workflow.ready ? workflow.missing : null;

  const blockNode = setupBlocked ? (
    missingDocs && missingDocs.length > 0 ? (
      <div className="rounded-card border border-amber-400/30 bg-amber-400/8 px-4 py-3">
        <p className="mb-2 text-sm font-semibold text-navy-800/70">
          Before you can run this workflow:
        </p>
        <ul className="space-y-1.5">
          {missingDocs.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-navy-800/80">
              <span aria-hidden className="text-amber-400">☐</span>
              {cleanMissingLabel(item)}
            </li>
          ))}
        </ul>
        <Link
          href={adminHref}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-mint-700 hover:underline"
        >
          Upload in the Admin tab →
        </Link>
      </div>
    ) : (
      <span className="text-sm font-medium text-amber-400">{setupBlocked}</span>
    )
  ) : null;

  const busy = running || uploading;
  const hasInput =
    text.trim().length > 0 || files.length > 0 || existingIds.length > 0;
  // Picker workflows need SOMETHING (text or a file); others can run bare.
  const canRun = !!workflow && (!workflow.needsInputPicker || hasInput);

  function selectWorkflow(id: string) {
    setWorkflowId(id);
    // Candidates differ per workflow; typed text and fresh files carry over.
    setExistingIds([]);
    setError(null);
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function openPreview() {
    if (!workflow) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { prompt } = await previewRunPromptAction({
        projectId,
        workflowId: workflow.id,
        inputDocIds: existingIds,
        inputText: text.trim(),
      });
      setPreviewPrompt(prompt);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Could not build the preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function run() {
    if (!workflow) return;
    setError(null);
    setOutput("");
    try {
      // 1. Upload any fresh attachments first; they become project docs.
      setUploading(true);
      const uploadedIds: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("scopeId", projectId);
        fd.set("docType", primaryInputType);
        const { docId } = await uploadInputForRunAction(fd);
        uploadedIds.push(docId);
      }
      setUploading(false);

      // 2. Run with attachments + typed context.
      setRunning(true);
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          workflowId: workflow.id,
          inputDocIds: [...existingIds, ...uploadedIds],
          inputText: text.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Run failed (${response.status})`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
      }
      setText("");
      setFiles([]);
      setExistingIds([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setUploading(false);
      setRunning(false);
    }
  }

  return (
    <div>
      <WorkflowSelector
        workflows={workflows}
        value={workflowId}
        onChange={selectWorkflow}
        disabled={busy}
      />

      {setupBlocked ? (
        <div className="mt-4">{blockNode}</div>
      ) : (
        <div className="mt-5">
          {/* Composer: type context, attach files, run — any combination. */}
          <div className="rounded-card border border-navy-800/15 bg-white transition focus-within:border-mint-700">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              disabled={busy}
              placeholder={`Add context for this run — e.g. "Name: John, role: Project Manager, I like that he led a fintech migration…"`}
              className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-navy-800/35"
            />

            {(attachedExisting.length > 0 || files.length > 0) && (
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {attachedExisting.map((doc) => (
                  <AttachmentChip
                    key={doc.id}
                    label={doc.filename}
                    generated={doc.source === "workflow" || doc.docType === "output"}
                    disabled={busy}
                    onRemove={() =>
                      setExistingIds((prev) => prev.filter((id) => id !== doc.id))
                    }
                  />
                ))}
                {files.map((file, i) => (
                  <AttachmentChip
                    key={`${file.name}-${i}`}
                    label={file.name}
                    disabled={busy}
                    onRemove={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-800/8 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-chip px-2 py-1.5 text-sm font-semibold text-navy-800/55 transition hover:bg-cream-100 hover:text-navy-800">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => addFiles(e.target.files)}
                />
                <span aria-hidden>📎</span> Attach files
                <span className="font-normal text-navy-800/35">
                  PDF, DOCX, TXT, MD · 20 MB
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPreview}
                  disabled={busy || !workflow}
                  className="rounded-chip border border-navy-800/15 px-4 py-2 text-sm font-medium text-navy-800/50 transition hover:border-navy-800/35 hover:text-navy-800 disabled:opacity-40"
                >
                  Preview prompt
                </button>
                <Button onClick={run} disabled={busy || !canRun}>
                  {busy ? (uploading ? "Uploading…" : "Running…") : "▶ Run"}
                </Button>
              </div>
            </div>
          </div>

          {!canRun && !busy && (
            <p className="mt-2 text-xs text-navy-800/45">
              Type some context or attach a file (e.g. a {inputLabel.toLowerCase()})
              to run this workflow.
            </p>
          )}

          {availableExisting.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-navy-800/35">
                Attach from this project
              </p>
              <div className="flex flex-wrap gap-2">
                {availableExisting.map((doc) => {
                  const generated =
                    doc.source === "workflow" || doc.docType === "output";
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setExistingIds((prev) => [...prev, doc.id])}
                      className="inline-flex items-center gap-1.5 rounded-chip border border-navy-800/20 px-3 py-1.5 text-sm text-navy-800/70 transition hover:border-mint-700 hover:text-mint-700 disabled:opacity-40"
                    >
                      + {doc.filename}
                      {generated && (
                        <span className="rounded-full bg-sky-300/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-800/70">
                          AI output
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <RunOutput output={output} running={running} error={error} outputRef={outputRef} />

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Prompt preview"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-panel border border-navy-800/12 bg-white shadow-lift"
          >
            <div className="flex items-center justify-between gap-3 border-b border-navy-800/8 px-5 py-3.5">
              <div>
                <h3 className="font-semibold">Prompt preview</h3>
                <p className="text-xs text-navy-800/45">
                  Exactly what the AI will receive when you press Run.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="rounded-lg px-2 py-1 text-lg leading-none text-navy-800/40 transition hover:bg-cream-100 hover:text-navy-900"
              >
                ✕
              </button>
            </div>

            {files.length > 0 && (
              <p className="border-b border-amber-400/20 bg-amber-400/8 px-5 py-2 text-xs text-navy-800/60">
                📎 {files.length} freshly attached file
                {files.length > 1 ? "s are" : " is"} not in this preview — they
                are added when you run.
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {previewLoading ? (
                <p className="py-12 text-center text-sm text-navy-800/45">
                  Building the prompt…
                </p>
              ) : previewError ? (
                <p className="rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
                  {previewError}
                </p>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-navy-800/85">
                  {previewPrompt}
                </pre>
              )}
            </div>

            {!previewLoading && !previewError && (
              <p className="border-t border-navy-800/8 px-5 py-2.5 text-xs text-navy-800/40">
                ~{Math.ceil(previewPrompt.length / 4).toLocaleString()} tokens
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentChip({
  label,
  generated,
  disabled,
  onRemove,
}: {
  label: string;
  generated?: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip bg-mint-400/15 py-1 pl-3 pr-1.5 text-sm font-medium text-mint-700">
      📄 {label}
      {generated && (
        <span className="rounded-full bg-sky-300/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-800/70">
          AI output
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded-full px-1 text-mint-700/60 transition hover:text-coral-400"
      >
        ✕
      </button>
    </span>
  );
}

function WorkflowSelector({
  workflows,
  value,
  onChange,
  disabled,
}: {
  workflows: RunPanelWorkflow[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  if (workflows.length === 1) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
          Workflow
        </span>
        <div className="inline-flex items-center gap-2 rounded-chip bg-mint-400/12 px-3.5 py-2 text-sm font-semibold text-mint-700">
          <span aria-hidden>▶</span>
          {workflows[0].name}
        </div>
      </div>
    );
  }
  return (
    <label className="block min-w-56 max-w-xs">
      <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
        Workflow
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-chip border border-navy-800/20 bg-white px-3.5 py-2.5 outline-none focus:border-mint-700"
      >
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RunOutput({
  output,
  running,
  error,
  outputRef,
}: {
  output: string;
  running: boolean;
  error: string | null;
  outputRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {error && (
        <p className="mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {error}
        </p>
      )}
      {(output || running) && (
        <>
          <div
            ref={outputRef}
            className="prose-calyflow mt-5 max-h-130 overflow-y-auto rounded-card border border-navy-800/12 bg-white p-6"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            {running && (
              <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-mint-400" />
            )}
          </div>
          {!running && output && (
            <div className="mt-3">
              <DownloadButtons text={output} filename="workflow-output" />
            </div>
          )}
        </>
      )}
    </>
  );
}
