"use client";

import { Fragment } from "react";

export interface StarterPackItem {
  id: string;
  name: string;
}

/**
 * Onboarding hint above the run panel: the recommended workflows in run order.
 * Clicking a card selects that workflow (and the parent expands the canvas).
 */
export function WorkflowStarterPack({
  items,
  selectedId,
  onSelect,
  onDismiss,
}: {
  items: StarterPackItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="relative mb-5 rounded-panel border border-mint-400/45 bg-linear-to-br from-mint-400/10 to-sky-300/10 p-4 pr-10">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide the starter pack"
        className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full text-navy-800/40 transition hover:bg-white/70 hover:text-navy-900"
      >
        ✕
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span aria-hidden>✨</span>
        <h3 className="text-sm font-bold text-navy-900">
          Workflow Starter Pack
        </h3>
        <span className="text-xs text-navy-800/50">
          New here? Run these in order — intake → outreach.
        </span>
      </div>

      <ol className="flex flex-wrap items-stretch gap-2">
        {items.map((item, i) => {
          const selected = item.id === selectedId;
          return (
            <Fragment key={item.id}>
              <li className="min-w-0 flex-1 basis-44">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-pressed={selected}
                  className={`group flex h-full w-full flex-col gap-1.5 rounded-card border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-mint-700 bg-white shadow-sm ring-1 ring-mint-400"
                      : "border-navy-800/12 bg-white/70 hover:border-mint-700/50 hover:bg-white"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-mint-400 text-[10px] font-bold text-navy-900">
                      {i + 1}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/40">
                      Step {i + 1}
                    </span>
                  </span>
                  <span
                    className={`text-[13px] font-semibold leading-tight ${
                      selected
                        ? "text-mint-700"
                        : "text-navy-900 group-hover:text-mint-700"
                    }`}
                  >
                    {item.name}
                  </span>
                </button>
              </li>
              {i < items.length - 1 && (
                <li
                  aria-hidden
                  className="flex shrink-0 items-center self-center text-base text-navy-800/30"
                >
                  →
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
