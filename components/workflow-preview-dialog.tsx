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
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-panel border border-navy-800/12 bg-white shadow-lift"
          >
            <div className="flex items-center justify-between gap-3 border-b border-navy-800/8 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{name}</h3>
                {description && (
                  <p className="truncate text-xs text-navy-800/45">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                className="rounded-lg px-2 py-1 text-lg leading-none text-navy-800/40 transition hover:bg-cream-100 hover:text-navy-900"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <WorkflowCanvas graph={graph} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
