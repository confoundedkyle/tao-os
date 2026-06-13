"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui";
import { Toast } from "./toast";
import { toolActionClass } from "./doc-explorer";

interface Step {
  kind: "tool-call" | "tool-result";
  tool: string;
  summary: string;
}

// Friendly labels for the live progress list.
const TOOL_LABELS: Record<string, string> = {
  map_site: "Mapping the website",
  scrape_page: "Reading a page",
  find_contacts: "Finding key contacts (Hunter.io)",
  save_company_profile: "Writing the company profile",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
}

export function ImportDomain({ clientId }: { clientId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);

  async function start() {
    const value = domain.trim();
    if (!value || running) return;
    setError(null);
    setSteps([]);
    setRunning(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/import-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: value }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Import failed (${response.status})`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let succeeded = false;
      let newDocId: string | null = null;
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as {
            type: string;
            tool?: string;
            summary?: string;
            message?: string;
            succeeded?: boolean;
            docId?: string | null;
          };
          if (ev.type === "tool-call" || ev.type === "tool-result") {
            setSteps((prev) => [
              ...prev,
              {
                kind: ev.type as Step["kind"],
                tool: ev.tool!,
                summary: ev.summary ?? "",
              },
            ]);
          } else if (ev.type === "error") {
            setError(ev.message ?? "Import failed");
          } else if (ev.type === "done") {
            succeeded = !!ev.succeeded;
            newDocId = ev.docId ?? null;
          }
        }
      }
      if (succeeded) {
        setToastKey((k) => k + 1);
        setDomain("");
        setOpen(false);
        setSteps([]);
        // Open the freshly imported doc via the ?doc= param the DocExplorer
        // reads; the navigation also re-fetches the list so it shows up.
        router.push(newDocId ? `${pathname}?doc=${newDocId}` : pathname);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    // `display: contents` keeps the trigger button inline in the toolbar flow
    // while giving this component a single root element (a bare fragment here
    // trips React's "each child in a list needs a key" check when slotted in
    // among the toolbar's other children).
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Import a client from their website"
        className={toolActionClass}
      >
        <span aria-hidden className="text-sm leading-none">
          ✨
        </span>
        Import
      </button>

      {toastKey > 0 && (
        <Toast key={toastKey} message="Company profile imported" />
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Import from website"
        >
          {/* Backdrop — click to dismiss when idle */}
          <button
            type="button"
            aria-label="Close"
            disabled={running}
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-navy-900/40"
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card border border-navy-800/12 bg-white p-6 shadow-lift">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-navy-800">
                  <span aria-hidden>✨</span> Import from website
                </h3>
                <p className="mt-1 text-sm text-navy-800/55">
                  Enter the company&apos;s domain — an AI agent researches the
                  site (and key contacts) and writes a company profile into this
                  knowledge base.
                </p>
              </div>
              {!running && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="-mr-1 -mt-1 shrink-0 rounded p-1 text-navy-800/40 transition hover:bg-navy-800/8 hover:text-navy-900"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-chip border border-navy-800/20 bg-white focus-within:border-mint-700">
                <span className="select-none border-r border-navy-800/10 px-3 py-2.5 text-sm text-navy-800/40">
                  https://
                </span>
                <input
                  autoFocus
                  value={domain}
                  disabled={running}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      start();
                    } else if (e.key === "Escape" && !running) {
                      setOpen(false);
                    }
                  }}
                  placeholder="acme.com"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-navy-800/35"
                />
              </div>
              <Button
                variant="small"
                onClick={start}
                disabled={running || !domain.trim()}
              >
                {running ? "Importing…" : "Import"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-navy-800/40">
              Just the domain — no https://, no subdomain (e.g. acme.com).
            </p>

            {error && (
              <p className="mt-3 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
                {error}
              </p>
            )}

            {(steps.length > 0 || running) && (
              <div className="mt-4 rounded-card border border-navy-800/12 bg-cream-100/50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-800/40">
                  What the agent is doing
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
          </div>
        </div>
      )}
    </div>
  );
}
