"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./ui";

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
}

export function RunPanel({
  projectId,
  workflows,
  inputCandidates,
  blockedMessage,
}: {
  projectId: string;
  workflows: RunPanelWorkflow[];
  inputCandidates: RunPanelDoc[];
  blockedMessage: string | null;
}) {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const workflow = useMemo(
    () => workflows.find((w) => w.id === workflowId),
    [workflows, workflowId],
  );
  const candidates = useMemo(
    () =>
      workflow?.needsInputPicker
        ? inputCandidates.filter(
            (d) => d.docType && workflow.inputDocTypes.includes(d.docType),
          )
        : [],
    [workflow, inputCandidates],
  );

  const disabledReason = blockedMessage
    ? blockedMessage
    : !workflow
      ? "Import a workflow first"
      : !workflow.ready
        ? workflow.missing.join(" · ")
        : workflow.needsInputPicker && selectedDocs.length === 0
          ? "Select at least one input document"
          : null;

  async function run() {
    if (!workflow) return;
    setRunning(true);
    setError(null);
    setOutput("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          workflowId: workflow.id,
          inputDocIds: selectedDocs,
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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56">
          <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
            Workflow
          </span>
          <select
            value={workflowId}
            onChange={(e) => {
              setWorkflowId(e.target.value);
              setSelectedDocs([]);
            }}
            className="w-full rounded-chip border border-navy-800/20 bg-white px-3.5 py-2.5 outline-none focus:border-mint-700"
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={run} disabled={!!disabledReason || running}>
          {running ? "Running…" : "▶ Run"}
        </Button>
        {disabledReason && !running && (
          <span className="text-sm font-medium text-amber-400">
            {disabledReason}
          </span>
        )}
      </div>

      {workflow?.needsInputPicker && candidates.length > 0 && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold text-navy-800/80">
            Input documents
          </legend>
          <div className="flex flex-wrap gap-2">
            {candidates.map((doc) => {
              const checked = selectedDocs.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className={`cursor-pointer rounded-chip border px-3 py-1.5 text-sm font-medium transition ${
                    checked
                      ? "border-mint-700 bg-mint-400/20 text-mint-700"
                      : "border-navy-800/20 text-navy-800/70 hover:border-navy-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedDocs((prev) =>
                        e.target.checked
                          ? [...prev, doc.id]
                          : prev.filter((id) => id !== doc.id),
                      )
                    }
                    className="sr-only"
                  />
                  {checked ? "✓ " : ""}
                  {doc.filename}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p className="mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {error}
        </p>
      )}

      {(output || running) && (
        <div
          ref={outputRef}
          className="prose-calyflow mt-5 max-h-130 overflow-y-auto rounded-card border border-navy-800/12 bg-white p-6"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
          {running && (
            <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-mint-400" />
          )}
        </div>
      )}
    </div>
  );
}
