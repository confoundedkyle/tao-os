"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  setDocumentActiveAction,
  uploadDocumentAction,
  uploadInputForRunAction,
} from "@/lib/actions/documents";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { DownloadButtons } from "@/components/download-buttons";
import { WorkflowCanvas } from "@/components/workflow-canvas";
import { Button } from "@/components/ui";

interface DemoCv {
  id: string;
  filename: string;
}

interface CvRow extends DemoCv {
  sample: boolean;
}

export function DemoExperience({
  projectId,
  workflowId,
  workflowName,
  graph,
  jd,
  cvs,
}: {
  projectId: string;
  workflowId: string;
  workflowName: string;
  graph: WorkflowGraph;
  jd: { id: string; filename: string; text: string };
  cvs: DemoCv[];
}) {
  const [tab, setTab] = useState<"cv" | "agentic">("cv");

  return (
    <div>
      <Hero />
      <Tabs tab={tab} onChange={setTab} />
      {tab === "cv" ? (
        <CvScreener
          projectId={projectId}
          workflowId={workflowId}
          workflowName={workflowName}
          graph={graph}
          jd={jd}
          cvs={cvs}
        />
      ) : (
        <AgenticComingSoon />
      )}
    </div>
  );
}

function Hero() {
  return (
    <div className="mb-7 overflow-hidden rounded-card bg-linear-to-br from-navy-900 to-navy-800 p-7 text-white shadow-lift sm:p-9">
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-mint-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-mint-400">
        ✦ Live demo
      </span>
      {/* Inline color: globals.css sets an UNLAYERED `h1 { color: navy }` rule,
          which beats Tailwind's layered `text-white` utility. Inline style wins. */}
      <h1
        style={{ color: "#fff" }}
        className="mt-3 text-2xl font-bold leading-tight sm:text-[34px]"
      >
        Screen a stack of CVs in seconds — not hours
      </h1>
      <p className="mt-2 max-w-[60ch] text-white/65">
        This is the real CV Screener workflow, tuned for recruiting. Use our
        sample role and candidates, or drop in your own — then hit run and watch
        an evidence-based scorecard appear.
      </p>
    </div>
  );
}

function Tabs({
  tab,
  onChange,
}: {
  tab: "cv" | "agentic";
  onChange: (t: "cv" | "agentic") => void;
}) {
  const base =
    "rounded-chip px-4 py-2 text-sm font-semibold transition";
  return (
    <div className="mb-6 inline-flex gap-1 rounded-chip border border-navy-800/12 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("cv")}
        className={`${base} ${
          tab === "cv"
            ? "bg-mint-400 text-navy-900"
            : "text-navy-800/60 hover:text-navy-900"
        }`}
      >
        🧰 CV Screener
      </button>
      <button
        type="button"
        onClick={() => onChange("agentic")}
        className={`${base} flex items-center gap-1.5 ${
          tab === "agentic"
            ? "bg-navy-900 text-white"
            : "text-navy-800/50 hover:text-navy-800"
        }`}
      >
        🤖 Agentic run
        <span className="rounded-full bg-amber-400/25 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-400">
          Soon
        </span>
      </button>
    </div>
  );
}

function AgenticComingSoon() {
  return (
    <div className="rounded-card border border-dashed border-navy-800/20 bg-cream-50 p-10 text-center">
      <div className="text-4xl">🤖</div>
      <h2 className="mt-3 text-xl font-semibold">Agentic run — coming soon</h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-navy-800/55">
        Where the CV Screener is a single AI call, an agentic run plans and takes
        multiple steps on its own — pulling candidates from your ATS, screening
        each one, and drafting outreach. We&apos;re putting the finishing touches
        on this demo.
      </p>
    </div>
  );
}

function CvScreener({
  projectId,
  workflowId,
  workflowName,
  graph,
  jd,
  cvs,
}: {
  projectId: string;
  workflowId: string;
  workflowName: string;
  graph: WorkflowGraph;
  jd: { id: string; filename: string; text: string };
  cvs: DemoCv[];
}) {
  const [jdMode, setJdMode] = useState<"sample" | "custom">("sample");
  const [jdLabel, setJdLabel] = useState(jd.filename);
  const [jdBusy, setJdBusy] = useState(false);

  const [cvRows, setCvRows] = useState<CvRow[]>(
    cvs.map((c) => ({ ...c, sample: true })),
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(cvs.map((c) => c.id)),
  );
  const [cvBusy, setCvBusy] = useState(false);

  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const jdFileRef = useRef<HTMLInputElement>(null);

  function toggleCv(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function useSampleJd() {
    if (jdMode === "sample") return;
    setJdBusy(true);
    setError(null);
    try {
      await setDocumentActiveAction(jd.id, true);
      setJdMode("sample");
      setJdLabel(jd.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch the JD");
    } finally {
      setJdBusy(false);
    }
  }

  async function uploadJd(file: File) {
    setJdBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("scopeType", "project");
      fd.set("scopeId", projectId);
      fd.set("kind", "file");
      fd.set("docType", "jd");
      await uploadDocumentAction(fd);
      setJdMode("custom");
      setJdLabel(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the JD");
    } finally {
      setJdBusy(false);
    }
  }

  async function uploadCvs(files: FileList) {
    setCvBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("scopeId", projectId);
        fd.set("docType", "cv");
        const { docId } = await uploadInputForRunAction(fd);
        setCvRows((prev) => [
          ...prev,
          { id: docId, filename: file.name, sample: false },
        ]);
        setSelected((prev) => new Set(prev).add(docId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload a CV");
    } finally {
      setCvBusy(false);
      if (cvFileRef.current) cvFileRef.current.value = "";
    }
  }

  const busy = running || jdBusy || cvBusy;
  const canRun = selected.size > 0 && !busy;

  async function run() {
    if (selected.size === 0) {
      setError("Pick at least one CV to screen.");
      return;
    }
    setError(null);
    setOutput("");
    setRunning(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          workflowId,
          inputDocIds: Array.from(selected),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Canvas — the workflow shape, with the recruiting skill spotlighted. */}
      <div className="rounded-card border border-navy-800/12 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">How this workflow runs</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          Your inputs flow into one expert-tuned AI call, and a screening report
          comes out the other side.
        </p>
        <WorkflowCanvas graph={graph} highlightSkill />
      </div>

      {/* Two columns: Job Description (left) · CVs (right). */}
      <div className="grid gap-5 md:grid-cols-2">
        <ColumnCard
          step={1}
          title="Job description"
          subtitle="What we screen against"
        >
          <ModeToggle
            value={jdMode}
            disabled={jdBusy}
            onSample={useSampleJd}
            onCustomLabel="Upload your own"
            onCustom={() => jdFileRef.current?.click()}
          />
          <input
            ref={jdFileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            disabled={jdBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadJd(f);
              e.target.value = "";
            }}
          />
          <div className="mt-3 rounded-card border border-navy-800/10 bg-cream-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
              📄 {jdLabel}
              {jdMode === "sample" && (
                <span className="rounded-full bg-mint-400/20 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-mint-700">
                  Sample
                </span>
              )}
            </p>
            {jdMode === "sample" && (
              <div className="prose-calyflow mt-2 max-h-64 overflow-y-auto rounded-card border border-navy-800/8 bg-white/60 p-3 text-[12.5px] leading-relaxed text-navy-800/65 [&_h1]:mb-1 [&_h1]:text-base [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-[13px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {jd.text}
                </ReactMarkdown>
              </div>
            )}
            {jdBusy && (
              <p className="mt-2 text-xs text-navy-800/45">Updating…</p>
            )}
          </div>
        </ColumnCard>

        <ColumnCard step={2} title="Candidate CVs" subtitle="Who we screen">
          <div className="space-y-2">
            {cvRows.map((cv) => (
              <label
                key={cv.id}
                className="flex cursor-pointer items-center gap-3 rounded-card border border-navy-800/10 bg-white px-3.5 py-2.5 transition hover:border-mint-700/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(cv.id)}
                  onChange={() => toggleCv(cv.id)}
                  disabled={busy}
                  className="size-4 accent-mint-700"
                />
                <span className="flex-1 truncate text-sm font-medium text-navy-900">
                  {cv.filename}
                </span>
                {cv.sample && (
                  <span className="rounded-full bg-mint-400/20 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-mint-700">
                    Sample
                  </span>
                )}
              </label>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-navy-800/25 px-3 py-3 text-sm font-semibold text-navy-800/60 transition hover:border-mint-700 hover:text-mint-700">
            <input
              ref={cvFileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="sr-only"
              disabled={busy}
              onChange={(e) => e.target.files && void uploadCvs(e.target.files)}
            />
            {cvBusy ? "Uploading…" : "📎 Upload your own CV(s)"}
          </label>
        </ColumnCard>
      </div>

      {error && (
        <p className="rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {error}
        </p>
      )}

      {/* Run — the moment of truth. */}
      <div className="flex flex-col items-center gap-2 rounded-card bg-linear-to-br from-mint-400/15 to-sky-300/10 px-6 py-7 text-center">
        <Button onClick={run} disabled={!canRun} className="text-base">
          {running ? "Screening…" : "▶ Run Workflow"}
        </Button>
        <p className="text-sm text-navy-800/55">
          {selected.size > 0
            ? `Screening ${selected.size} CV${selected.size > 1 ? "s" : ""} against the job description`
            : "Pick at least one CV above to begin"}
        </p>
      </div>

      <RunOutput
        output={output}
        running={running}
        outputRef={outputRef}
        filename={`${workflowName} — screening report`}
      />
    </div>
  );
}

function ColumnCard({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-navy-800/12 bg-white p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-900 text-xs font-bold text-white">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold leading-tight text-navy-900">
            {title}
          </h3>
          <p className="text-xs text-navy-800/45">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ModeToggle({
  value,
  disabled,
  onSample,
  onCustom,
  onCustomLabel,
}: {
  value: "sample" | "custom";
  disabled: boolean;
  onSample: () => void;
  onCustom: () => void;
  onCustomLabel: string;
}) {
  const pill = "flex-1 rounded-chip px-3 py-1.5 text-sm font-semibold transition";
  return (
    <div className="flex gap-1 rounded-chip border border-navy-800/12 bg-cream-50 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onSample}
        className={`${pill} ${
          value === "sample"
            ? "bg-mint-400 text-navy-900"
            : "text-navy-800/55 hover:text-navy-900"
        }`}
      >
        Use our sample
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onCustom}
        className={`${pill} ${
          value === "custom"
            ? "bg-mint-400 text-navy-900"
            : "text-navy-800/55 hover:text-navy-900"
        }`}
      >
        {onCustomLabel}
      </button>
    </div>
  );
}

function RunOutput({
  output,
  running,
  outputRef,
  filename,
}: {
  output: string;
  running: boolean;
  outputRef: React.RefObject<HTMLDivElement | null>;
  filename: string;
}) {
  if (!output && !running) return null;
  return (
    <div>
      <div
        ref={outputRef}
        className="prose-calyflow max-h-130 overflow-y-auto rounded-card border border-navy-800/12 bg-white p-6"
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
      {!running && output && (
        <div className="mt-3">
          <DownloadButtons text={output} filename={filename} />
        </div>
      )}
    </div>
  );
}
