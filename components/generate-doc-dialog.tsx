"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

/**
 * A popup that explains WHY a sourcing prerequisite document matters (the
 * Sourcing Plan or the Qualification criteria) and lets the recruiter generate
 * it right there — streaming live progress, then confirming it was saved to
 * Documents. The generate endpoints (sourcing-plan / qualification) already
 * persist the doc; this just drives them and reflects progress.
 */
export function GenerateDocDialog({
  open,
  onClose,
  endpoint,
  title,
  what,
  projectId,
  documentsHref,
  alreadyExists,
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  title: string;
  what: string;
  projectId: string;
  documentsHref: string;
  alreadyExists: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, running]);

  if (!open) return null;

  async function generate() {
    if (running) return;
    setRunning(true);
    setError(null);
    setSteps([]);
    setPreview("");
    setDone(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Could not generate (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "text") {
            setPreview((p) => (p + String(evt.value ?? "")).slice(-4000));
          } else if (evt.type === "tool-call") {
            setSteps((s) => [...s, String(evt.summary ?? evt.tool ?? "…")]);
          } else if (evt.type === "error") {
            setError(String(evt.message ?? "Generation failed"));
          } else if (evt.type === "done") {
            if (evt.succeeded) setDone(true);
          }
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
      onClick={() => !running && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-panel border border-navy-800/12 bg-white shadow-lift"
      >
        <div className="flex items-center justify-between gap-3 border-b border-navy-800/8 px-6 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={() => !running && onClose()}
            aria-label="Close"
            disabled={running}
            className="rounded-lg px-2 py-1 text-lg leading-none text-navy-800/40 transition hover:bg-cream-100 hover:text-navy-900 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-relaxed text-navy-800/70">{what}</p>

          {done ? (
            <div className="rounded-card border border-mint-400/30 bg-mint-400/8 px-4 py-3 text-sm text-navy-800/75">
              ✓ Done — saved to your{" "}
              <Link href={documentsHref} className="font-semibold text-mint-700 hover:underline">
                Documents
              </Link>
              . You can edit or refine it there anytime.
            </div>
          ) : running ? (
            <div className="rounded-card border border-navy-800/12 bg-cream-100/50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-navy-800/60">
                <span
                  role="status"
                  aria-live="polite"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-mint-400/30 border-t-mint-400"
                />
                Generating…
              </div>
              {steps.length > 0 && (
                <ol className="mb-2 space-y-0.5">
                  {steps.slice(-4).map((s, i) => (
                    <li key={i} className="truncate text-xs text-navy-800/45">
                      ▸ {s}
                    </li>
                  ))}
                </ol>
              )}
              {preview && (
                <pre className="max-h-40 overflow-hidden whitespace-pre-wrap text-[11px] leading-relaxed text-navy-800/40">
                  {preview.slice(-600)}
                </pre>
              )}
            </div>
          ) : null}

          {error && (
            <p className="rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-navy-800/8 px-6 py-4">
          {done ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => !running && onClose()}
                disabled={running}
                className="text-sm font-medium text-navy-800/55 hover:text-navy-900 disabled:opacity-40"
              >
                Cancel
              </button>
              <Button onClick={generate} disabled={running}>
                {running
                  ? "Generating…"
                  : alreadyExists
                    ? "Regenerate"
                    : `Generate ${title}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
