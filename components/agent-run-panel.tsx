"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { uploadDocumentAction } from "@/lib/actions/documents";
import { deriveAgentGraph } from "@/lib/workflow-graph";
import { Button } from "./ui";
import { WorkflowCanvas } from "./workflow-canvas";

/** A required project document the agent needs before it can run. */
export interface AgentMissingDoc {
  docType: string;
  label: string;
}

/** A connector category an agent needs, with the workspace's connected
 *  options for it (empty = nothing of that category is connected yet). */
export interface AgentConnectorRequirement {
  category: string;
  label: string;
  options: { provider: string; label: string }[];
}

export interface AgentRunPanelAgent {
  id: string;
  name: string;
  /** Library slug — drives the "Documents" node on the canvas. */
  slug?: string;
  /** Shown under the "Advanced skill" node on the canvas. */
  description?: string;
  /** Full instructions — shown when the skill node on the canvas is opened. */
  instructions?: string;
  requirements: AgentConnectorRequirement[];
}

interface Step {
  kind: "tool-call" | "tool-result";
  tool: string;
  summary: string;
}

/** A file attached for this run only — its extracted text is sent with the run
 *  and never saved as a project document. */
interface RunAttachment {
  name: string;
  text: string;
}

const ATTACH_ACCEPT = ".pdf,.docx,.txt,.md";
const ATTACH_MAX_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

const TOOL_LABELS: Record<string, string> = {
  calyflow_search_documents: "Searched knowledge base",
  calyflow_read_document: "Read document",
  calyflow_create_document: "Saved document",
  gmail_send_email: "Sent email (Gmail)",
  outlook_send_email: "Sent email (Outlook)",
};

/** "greenhouse_list_jobs" → "greenhouse · list jobs" for unmapped tools. */
function toolLabel(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  const [prefix, ...rest] = tool.split("_");
  return rest.length ? `${prefix} · ${rest.join(" ")}` : tool;
}

function defaultChoices(agent: AgentRunPanelAgent | undefined) {
  const choices: Record<string, string> = {};
  for (const req of agent?.requirements ?? []) {
    if (req.options[0]) choices[req.category] = req.options[0].provider;
  }
  return choices;
}

export function AgentRunPanel({
  projectId,
  agents,
  model,
  connectorsHref,
  documentsHref,
  missingDocs = [],
  archived,
}: {
  projectId: string;
  agents: AgentRunPanelAgent[];
  model: { providerLabel: string; modelId: string } | null;
  connectorsHref: string;
  /** Project Documents tab — where to add the required docs. */
  documentsHref?: string;
  /** Required project documents that are not present yet — blocks the run. */
  missingDocs?: AgentMissingDoc[];
  archived: boolean;
}) {
  const router = useRouter();
  // Remember the last agent this project ran, so switching tabs/pages doesn't
  // snap the picker back to the first one.
  const [agentId, setAgentId] = usePersistedSelection(
    `calyflow:run-panel:agent:${projectId}`,
    agents[0]?.id ?? "",
    (id) => agents.some((a) => a.id === id),
  );
  // Per-agent connector picks, lazily defaulted — switching agents restores
  // that agent's previous picks instead of resetting them in an effect.
  const [choicesByAgent, setChoicesByAgent] = useState<
    Record<string, Record<string, string>>
  >({});
  const [diagramOpen, setDiagramOpen] = useState(true);
  const [task, setTask] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputDocId, setOutputDocId] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Files attached for this run only (not saved to the project).
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<RunAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function addAttachments(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files per run.`);
      return;
    }
    setAttaching(true);
    try {
      for (const file of Array.from(list).slice(0, room)) {
        if (file.size > ATTACH_MAX_BYTES) {
          setError(`${file.name} is over the 20 MB limit.`);
          continue;
        }
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/agents/extract", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? `Couldn't attach ${file.name}`);
          continue;
        }
        setAttachments((prev) => [...prev, { name: data.name, text: data.text }]);
      }
    } finally {
      setAttaching(false);
      if (attachRef.current) attachRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadRequiredDoc(file: File, docType: string) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("scopeType", "project");
      fd.set("scopeId", projectId);
      fd.set("kind", "file");
      fd.set("docType", docType);
      await uploadDocumentAction(fd);
      router.refresh(); // server recomputes missingDocs → the gate clears
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const agent = useMemo(
    () => agents.find((a) => a.id === agentId),
    [agents, agentId],
  );
  const choices = choicesByAgent[agentId] ?? defaultChoices(agent);
  const setChoice = (category: string, provider: string) =>
    setChoicesByAgent((prev) => ({
      ...prev,
      [agentId]: { ...(prev[agentId] ?? defaultChoices(agent)), [category]: provider },
    }));

  const missingCategories = (agent?.requirements ?? []).filter(
    (req) => req.options.length === 0,
  );
  const blocked = missingCategories.length > 0 || missingDocs.length > 0;
  const ready = !blocked;

  const graph = useMemo(() => {
    if (!agent) return null;
    return deriveAgentGraph({
      name: agent.name,
      connectors: agent.requirements.map((req) => {
        const provider = choices[req.category] ?? null;
        const option = req.options.find((o) => o.provider === provider);
        return {
          category: req.category,
          categoryLabel: req.label,
          selectedProvider: option?.provider ?? null,
          selectedLabel: option?.label,
        };
      }),
      model,
      slug: agent.slug,
      description: agent.description,
      instructions: agent.instructions,
    });
  }, [agent, choices, model]);

  async function run() {
    if (!agent || running || !ready) return;
    setError(null);
    setOutput("");
    setSteps([]);
    setOutputDocId(null);
    setRunning(true);
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          agentId: agent.id,
          task: task.trim(),
          connectors: choices,
          attachments,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Run failed (${response.status})`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleEvent(JSON.parse(line));
        }
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(ev: {
    type: string;
    value?: string;
    tool?: string;
    summary?: string;
    message?: string;
    outputDocId?: string | null;
  }) {
    switch (ev.type) {
      case "text":
        setOutput((prev) => prev + (ev.value ?? ""));
        break;
      case "tool-call":
        setSteps((prev) => [
          ...prev,
          { kind: "tool-call", tool: ev.tool!, summary: ev.summary ?? "" },
        ]);
        break;
      case "tool-result":
        setSteps((prev) => [
          ...prev,
          { kind: "tool-result", tool: ev.tool!, summary: ev.summary ?? "" },
        ]);
        break;
      case "error":
        setError(ev.message ?? "Agent run failed");
        break;
      case "done":
        if (ev.outputDocId) setOutputDocId(ev.outputDocId);
        break;
    }
  }

  if (agents.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        {/* The selector only matters when several agents share a panel; on the
            per-agent page there's a single agent named in the heading. */}
        {agents.length > 1 && (
          <label className="block min-w-56 max-w-xs">
            <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
              Agent
            </span>
            <select
              value={agentId}
              disabled={running}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-chip border border-navy-800/20 bg-white px-3.5 py-2.5 outline-none focus:border-mint-700"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(agent?.requirements ?? [])
          .filter((req) => req.options.length > 0)
          .map((req) => (
            <label key={req.category} className="block min-w-44 max-w-xs">
              <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
                {req.label} connector
              </span>
              <select
                value={choices[req.category] ?? ""}
                disabled={running}
                onChange={(e) => setChoice(req.category, e.target.value)}
                className="w-full rounded-chip border border-navy-800/20 bg-white px-3.5 py-2.5 outline-none focus:border-mint-700"
              >
                {req.options.map((o) => (
                  <option key={o.provider} value={o.provider}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>

      {graph && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setDiagramOpen((open) => !open)}
            aria-expanded={diagramOpen}
            className="flex items-center gap-1.5 text-sm font-semibold text-navy-800/60 transition hover:text-navy-800"
          >
            <span
              aria-hidden
              className={`inline-block text-[11px] transition-transform ${diagramOpen ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            How this works
          </button>
          {diagramOpen && <WorkflowCanvas graph={graph} className="mt-3" />}
        </div>
      )}

      {blocked && (
        <div className="mt-4 rounded-card border border-amber-400/30 bg-amber-400/8 px-4 py-3">
          <p className="text-sm font-semibold text-navy-800/70">
            Before you can run this agent:
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {missingDocs.map((doc) => (
              <li
                key={doc.docType}
                className="flex items-center justify-between gap-3 text-sm text-navy-800/80"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className="text-amber-400">
                    ☐
                  </span>
                  Add the {doc.label}
                  <span className="rounded-full bg-amber-400/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-400">
                    Required
                  </span>
                </span>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setUploadDocType(doc.docType);
                    fileRef.current?.click();
                  }}
                  className="shrink-0 rounded-chip border border-navy-800/20 px-2.5 py-1 text-xs font-semibold text-navy-800/70 transition hover:border-mint-700 hover:text-mint-700 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </li>
            ))}
            {missingCategories.map((req) => (
              <li
                key={req.category}
                className="flex items-center gap-2 text-sm text-navy-800/80"
              >
                <span aria-hidden className="text-amber-400">
                  ☐
                </span>
                <Link
                  href={`${connectorsHref}?category=${req.category}`}
                  className="font-semibold text-mint-700 hover:underline"
                >
                  Connect {/^[aeio]/i.test(req.label) ? "an" : "a"} {req.label}{" "}
                  connector
                </Link>
              </li>
            ))}
          </ul>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && uploadDocType) void uploadRequiredDoc(f, uploadDocType);
            }}
          />
          {missingDocs.length > 0 && documentsHref && (
            <Link
              href={documentsHref}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-mint-700 hover:underline"
            >
              Manage documents in the Documents tab →
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 rounded-panel border border-mint-400/40 bg-mint-400/8 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-mint-700">
            Your task for this run
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!running) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!running) void addAttachments(e.dataTransfer.files);
            }}
            className={`relative rounded-card border-[1.5px] bg-white shadow-[0_4px_18px_rgba(19,31,56,0.07)] transition focus-within:border-mint-700 ${
              dragOver
                ? "border-dashed border-mint-700 ring-2 ring-mint-400/40"
                : "border-navy-800/15"
            }`}
          >
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-card bg-mint-400/12 backdrop-blur-[1px]">
                <span aria-hidden className="text-2xl">
                  📎
                </span>
                <span className="text-sm font-semibold text-mint-700">
                  Drop files to attach for this run
                </span>
              </div>
            )}
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              disabled={running}
              placeholder="Add clarifying information to complete this task."
              className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-navy-800/35"
            />
            {attachments.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 border-t border-navy-800/8 px-3 py-2.5">
                {attachments.map((a, i) => (
                  <li
                    key={`${a.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-chip bg-cream-100 px-2 py-1 text-xs font-medium text-navy-800/70"
                  >
                    <span aria-hidden>📄</span>
                    <span className="max-w-44 truncate" title={a.name}>
                      {a.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      disabled={running}
                      aria-label={`Remove ${a.name}`}
                      className="text-navy-800/40 transition hover:text-coral-400 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-navy-800/8 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-chip px-2 py-1.5 text-sm font-semibold text-navy-800/55 transition hover:bg-cream-100 hover:text-navy-800">
                <input
                  ref={attachRef}
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPT}
                  className="sr-only"
                  disabled={running || attaching}
                  onChange={(e) => void addAttachments(e.target.files)}
                />
                <span aria-hidden>📎</span>
                {attaching ? "Attaching…" : "Attach files"}
                <span className="font-normal text-navy-800/35">
                  or drag &amp; drop
                </span>
              </label>
              <Button onClick={run} disabled={running || archived || !ready}>
                {running ? "Running…" : "▶ Run agent"}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-navy-800/40">
            Attached files (PDF, DOCX, TXT, MD · 20 MB) are used for this run
            only and aren&apos;t saved. To keep a file, add it in the Documents
            tab.
          </p>
        </div>

      {archived && (
        <p className="mt-3 text-sm font-medium text-amber-400">
          This project is archived.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {error}
        </p>
      )}

      {(steps.length > 0 || running) && (
        <div className="mt-5 rounded-card border border-navy-800/12 bg-cream-100/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-800/40">
            What the agent did
          </p>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span aria-hidden className="mt-0.5 shrink-0">
                  {step.kind === "tool-call" ? "▸" : "✓"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-navy-800/80">
                    {toolLabel(step.tool)}
                  </span>
                  <span
                    className="block truncate text-xs text-navy-800/45"
                    title={step.summary}
                  >
                    {step.summary}
                  </span>
                </span>
              </li>
            ))}
            {running && (
              <li className="flex items-center gap-2 text-sm text-navy-800/45">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-mint-400" />
                Thinking…
              </li>
            )}
          </ol>
        </div>
      )}

      {(output || running) && (
        <div
          ref={outputRef}
          className="prose-calyflow mt-5 max-h-130 overflow-y-auto rounded-card border border-navy-800/12 bg-white p-6"
        >
          {running && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 flex items-center gap-2.5 text-sm font-medium text-navy-800/55"
            >
              <span
                aria-hidden
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-mint-400/30 border-t-mint-400"
              />
              {output ? "Generating…" : "Working on it — this can take a moment…"}
            </div>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
          {running && output && (
            <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-mint-400 align-text-bottom" />
          )}
        </div>
      )}

      {outputDocId && !running && (
        <p className="mt-3 text-sm">
          <Link
            href={`/docs/${outputDocId}`}
            className="font-semibold text-mint-700 hover:underline"
          >
            View saved document →
          </Link>
        </p>
      )}
    </div>
  );
}
