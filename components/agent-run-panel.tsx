"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./ui";

export interface AgentRunPanelAgent {
  id: string;
  name: string;
  requiredConnectors: string[];
}

const CONNECTOR_LABELS: Record<string, string> = {
  airtable: "Airtable",
  ashby: "Ashby",
  hunter: "Hunter.io",
};

interface Step {
  kind: "tool-call" | "tool-result";
  tool: string;
  summary: string;
}

const TOOL_LABELS: Record<string, string> = {
  calyflow_search_documents: "Searched knowledge base",
  calyflow_read_document: "Read document",
  airtable_list_bases: "Listed Airtable bases",
  airtable_list_tables: "Listed Airtable tables",
  airtable_query_records: "Queried Airtable",
  ashby_list_jobs: "Listed Ashby jobs",
  ashby_list_candidates: "Listed Ashby candidates",
  ashby_search_candidates: "Searched Ashby candidates",
  hunter_domain_search: "Searched Hunter.io for contacts",
  hunter_email_finder: "Found an email (Hunter.io)",
  hunter_email_verifier: "Verified an email (Hunter.io)",
  calyflow_create_document: "Saved document",
};

export function AgentRunPanel({
  projectId,
  agents,
  connectedProviders,
  connectorsHref,
  archived,
}: {
  projectId: string;
  agents: AgentRunPanelAgent[];
  connectedProviders: string[];
  connectorsHref: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
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
  const missingConnectors = useMemo(
    () =>
      (agent?.requiredConnectors ?? []).filter(
        (p) => !connectedProviders.includes(p),
      ),
    [agent, connectedProviders],
  );
  const needsConnector = missingConnectors.length > 0;

  async function run() {
    if (!agent || running) return;
    setError(null);
    setOutput("");
    setSteps([]);
    setOutputDocId(null);
    setRunning(true);
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, agentId: agent.id, task: task.trim() }),
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
      </div>

      <div className="mt-4 rounded-card border border-navy-800/15 bg-white transition focus-within:border-mint-700">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          disabled={running}
          placeholder={`What should the agent do? e.g. "Find all active candidates in Berlin from my Airtable and summarise their fit for this role."`}
          className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-navy-800/35"
        />
        <div className="flex items-center justify-end border-t border-navy-800/8 px-3 py-2.5">
          <Button onClick={run} disabled={running || archived || needsConnector}>
            {running ? "Running…" : "▶ Run agent"}
          </Button>
        </div>
      </div>

      {archived && (
        <p className="mt-3 text-sm font-medium text-amber-400">
          This project is archived.
        </p>
      )}
      {needsConnector && (
        <p className="mt-3 inline-block rounded-chip bg-amber-400/15 px-3 py-2 text-sm font-medium text-navy-800/80">
          This agent needs{" "}
          {missingConnectors
            .map((p) => CONNECTOR_LABELS[p] ?? p)
            .join(" and ")}
          , which {missingConnectors.length > 1 ? "aren't" : "isn't"} connected.{" "}
          <Link href={connectorsHref} className="font-semibold text-mint-700 hover:underline">
            Connect {missingConnectors.length > 1 ? "them" : "it"} →
          </Link>
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
                    {TOOL_LABELS[step.tool] ?? step.tool}
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
