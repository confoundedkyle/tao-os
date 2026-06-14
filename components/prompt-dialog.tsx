"use client";

import { useEffect, useState } from "react";

/** A small badge that opens a modal showing an agent's full prompt
 *  (instructions), scrollable — mirrors the "See how it works" canvas dialog. */
export function PromptDialog({
  name,
  prompt,
  label = "Advanced skill",
}: {
  name: string;
  prompt: string;
  label?: string;
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
        title="View the agent's prompt"
        className="inline-flex items-center gap-1 rounded-full bg-navy-800/8 px-2 py-0.5 text-xs font-semibold text-navy-800/60 transition hover:bg-navy-800/15"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${name} prompt`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-panel border border-navy-800/12 bg-white shadow-lift"
          >
            <div className="flex items-center justify-between gap-3 border-b border-navy-800/8 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{name}</h3>
                <p className="truncate text-xs text-navy-800/45">
                  Agent instructions (the prompt it runs)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-lg leading-none text-navy-800/40 transition hover:bg-cream-100 hover:text-navy-900"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-navy-800/80">
                {prompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
