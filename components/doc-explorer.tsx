"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createKbNoteAction,
  deleteDocumentAction,
  renameDocumentAction,
  updateDocumentTextAction,
  uploadDocumentAction,
} from "@/lib/actions/documents";
import type { Doc } from "@/lib/types";
import { Button } from "./ui";

/** Markdown/plain-text docs are editable; binary uploads (PDF, DOCX) are not. */
function isEditable(doc: Doc): boolean {
  if (!doc.storage_path) return true;
  const name = (doc.filename ?? "").toLowerCase();
  return (
    name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")
  );
}

function isMarkdownName(doc: Doc): boolean {
  const name = (doc.filename ?? "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown") || !doc.storage_path;
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function UploadLabel({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <>{pending ? "Uploading…" : label}</>;
}

export function DocExplorer({
  scopeType,
  scopeId,
  docs,
  mode,
}: {
  scopeType: "client" | "workspace";
  scopeId: string;
  docs: Doc[];
  mode: "kb" | "files";
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    docs[0]?.id ?? null,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fall back to the first doc if the selected one was deleted.
  const selected = docs.find((d) => d.id === selectedId) ?? docs[0] ?? null;

  function select(doc: Doc) {
    setSelectedId(doc.id);
    setEditing(false);
    setRenaming(false);
    setError(null);
  }

  function startRename() {
    if (!selected) return;
    setNameDraft(selected.filename ?? "");
    setRenaming(true);
  }

  function saveName() {
    if (!selected) return;
    const next = nameDraft.trim();
    if (!next || next === selected.filename) {
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      try {
        setError(null);
        await renameDocumentAction(selected.id, next);
        setRenaming(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not rename");
      }
    });
  }

  function startEdit() {
    if (!selected) return;
    setDraft(selected.extracted_text ?? "");
    setEditing(true);
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      try {
        setError(null);
        await updateDocumentTextAction(selected.id, draft);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  function newNote() {
    startTransition(async () => {
      try {
        setError(null);
        const { docId } = await createKbNoteAction(scopeType, scopeId);
        setSelectedId(docId);
        setDraft("");
        setEditing(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create note");
      }
    });
  }

  function remove(doc: Doc) {
    if (
      !window.confirm(
        `Delete "${doc.filename ?? "Untitled"}"? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteDocumentAction(doc.id);
        if (doc.id === selectedId) {
          setSelectedId(null);
          setEditing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
      {/* Left: GitHub-style flat file list */}
      <div>
        <div className="overflow-hidden rounded-card border border-navy-800/12 bg-white">
          {docs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-navy-800/45">
              {mode === "kb" ? "No notes yet." : "No files yet."}
            </p>
          ) : (
            <ul className="divide-y divide-navy-800/8">
              {docs.map((doc) => {
                const active = selected?.id === doc.id;
                return (
                  <li key={doc.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => select(doc)}
                      className={[
                        "flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "bg-mint-400/12 font-medium text-mint-700"
                          : "text-navy-800/75 hover:bg-cream-100",
                      ].join(" ")}
                    >
                      <FileIcon
                        className={
                          active ? "shrink-0 text-mint-700" : "shrink-0 text-navy-800/35"
                        }
                      />
                      <span className="truncate">{doc.filename ?? "Untitled"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(doc)}
                      aria-label={`Delete ${doc.filename}`}
                      className="px-2.5 text-navy-800/35 opacity-0 transition hover:text-coral-400 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Add controls under the list */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mode === "kb" && (
            <Button variant="small" onClick={newNote} disabled={pending}>
              + New note
            </Button>
          )}
          <form action={uploadDocumentAction}>
            <input type="hidden" name="scopeType" value={scopeType} />
            <input type="hidden" name="scopeId" value={scopeId} />
            <input type="hidden" name="kind" value={mode === "kb" ? "kb" : "file"} />
            <input type="hidden" name="docType" value={mode === "kb" ? "note" : "other"} />
            <label className="inline-flex cursor-pointer items-center rounded-chip border border-navy-800/20 px-3 py-1.5 text-sm font-semibold text-navy-800/70 transition hover:border-navy-800/50 hover:text-navy-900">
              <input
                type="file"
                name="file"
                accept=".pdf,.docx,.txt,.md"
                className="sr-only"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
              <UploadLabel label="⬆ Upload file" />
            </label>
          </form>
        </div>
        <p className="mt-2 text-xs text-navy-800/35">PDF, DOCX, TXT, MD · 20 MB</p>
      </div>

      {/* Right: preview / editor */}
      <div className="min-w-0 rounded-card border border-navy-800/12 bg-white">
        {!selected ? (
          <p className="px-6 py-16 text-center text-sm text-navy-800/45">
            {mode === "kb"
              ? "Create a note or upload a file to get started."
              : "Select a file on the left to preview it."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-navy-800/8 px-5 py-3">
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveName();
                      } else if (e.key === "Escape") {
                        setRenaming(false);
                      }
                    }}
                    disabled={pending}
                    className="w-full rounded-chip border border-navy-800/20 px-2.5 py-1 font-semibold outline-none focus:border-mint-700"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startRename}
                    title="Click to rename"
                    className="group/name flex min-w-0 items-center gap-1.5 text-left"
                  >
                    <span className="truncate font-semibold">
                      {selected.filename ?? "Untitled"}
                    </span>
                    <span className="shrink-0 text-navy-800/30 transition group-hover/name:text-mint-700">
                      ✎
                    </span>
                  </button>
                )}
                <p className="text-xs text-navy-800/40">
                  {new Date(selected.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {selected.storage_path && !isEditable(selected)
                    ? " · uploaded document — preview only"
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      disabled={pending}
                      className="rounded-chip px-3 py-1.5 text-sm font-medium text-navy-800/55 transition hover:text-navy-900"
                    >
                      Cancel
                    </button>
                    <Button variant="small" onClick={save} disabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                  </>
                ) : (
                  isEditable(selected) && (
                    <Button variant="smallSecondary" onClick={startEdit}>
                      ✎ Edit
                    </Button>
                  )
                )}
              </div>
            </div>

            {error && (
              <p className="mx-5 mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
                {error}
              </p>
            )}

            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={18}
                autoFocus
                placeholder={
                  mode === "kb"
                    ? "- Prefers candidates from product companies\n- Interview process: intro call → tech screen → onsite\n- Hates job-hoppers"
                    : ""
                }
                className="block w-full resize-y border-0 bg-transparent px-5 py-4 font-mono text-[13.5px] leading-relaxed outline-none"
              />
            ) : selected.extracted_text ? (
              isMarkdownName(selected) ? (
                <div className="prose-calyflow max-h-[32rem] overflow-y-auto px-5 py-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.extracted_text}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap px-5 py-4 font-sans text-[14.5px] leading-relaxed">
                  {selected.extracted_text}
                </pre>
              )
            ) : (
              <p className="px-5 py-12 text-center text-sm text-navy-800/45">
                {isEditable(selected)
                  ? "Empty — click Edit to add content."
                  : "No preview available for this file type."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
