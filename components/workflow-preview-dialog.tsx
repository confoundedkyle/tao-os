"use client";

import { useEffect, useState } from "react";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { WorkflowCanvas } from "./workflow-canvas";

/** "See how it works" affordance on library cards — the canvas mounts only
 *  while the dialog is open, so a grid of cards stays cheap. */
export function WorkflowPreviewDialog({
  name,
  description,
  graph,
}: {
  name: string;
  description?: string;
  graph: WorkflowGraph;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-mint-700 transition hover:underline"
      >
        <span aria-hidden>◉</span> See how it works
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`How ${name} works`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-panel border border-navy-800/12 bg-white shadow-lift"
          >
            <div className="flex items-start justify-between gap-3 border-b border-navy-800/8 px-6 py-4">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">{name}</h3>
                {description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-navy-800/55">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-navy-800/40 transition hover:bg-cream-100 hover:text-navy-900"
              >
                ✕
              </button>
            </div>
            <div className="min-h-[65vh] flex-1 overflow-y-auto px-6 py-5">
              <WorkflowCanvas graph={graph} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
