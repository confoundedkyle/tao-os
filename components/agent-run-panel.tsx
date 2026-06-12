"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deriveAgentGraph } from "@/lib/workflow-graph";
import { Button } from "./ui";
import { WorkflowCanvas } from "./workflow-canvas";

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
  requirements: AgentConnectorRequirement[];
}

interface Step {
  kind: "tool-call" | "tool-result";
  tool: string;
  summary: string;
}

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
  archived,
}: {
  projectId: string;
  agents: AgentRunPanelAgent[];
  model: { providerLabel: string; modelId: string } | null;
  connectorsHref: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
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
  const ready = missingCategories.length === 0;

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

      {missingCategories.length > 0 ? (
        <div className="mt-4 rounded-card border border-amber-400/30 bg-amber-400/8 px-4 py-3">
          <p className="text-sm font-semibold text-navy-800/70">
            Before you can run this agent:
          </p>
          <ul className="mt-1.5 space-y-1">
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
                  className="hover:text-mint-700 hover:underline"
                >
                  Connect {/^[aeio]/i.test(req.label) ? "an" : "a"} {req.label}{" "}
                  connector
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`${connectorsHref}?category=${missingCategories[0].category}`}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-mint-700 hover:underline"
          >
            Set up a connector →
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-panel border border-mint-400/40 bg-mint-400/8 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mint-700">
            <span aria-hidden>▶</span> Your task for this run
          </p>
          <div className="rounded-card border-[1.5px] border-navy-800/15 bg-white shadow-[0_4px_18px_rgba(19,31,56,0.07)] transition focus-within:border-mint-700">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              disabled={running}
              placeholder={`What should the agent do? e.g. "Shortlist the best 5 backend candidates for this role."`}
              className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-navy-800/35"
            />
            <div className="flex items-center justify-end border-t border-navy-800/8 px-3 py-2.5">
              <Button onClick={run} disabled={running || archived || !ready}>
                {running ? "Running…" : "▶ Run agent"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
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
