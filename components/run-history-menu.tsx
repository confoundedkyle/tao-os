"use client";

import { useState } from "react";
import Link from "next/link";

export interface RunHistoryRow {
  id: string;
  conversationId: string | null;
  task: string | null;
  status: "running" | "succeeded" | "failed";
  created_at: string;
}

/** Top-right "Recent runs" dropdown for an agent. Scrollable + filterable so it
 *  stays usable with dozens of past runs, instead of a long card below. Each row
 *  reopens that run's conversation in the chat (?c=<id>); the "Show all" footer
 *  opens the full run history (every teammate's runs). */
export function RunHistoryMenu({
  runs,
  agentHref,
  allRunsHref,
}: {
  runs: RunHistoryRow[];
  /** The agent page, to reopen a conversation as `${agentHref}?c=<id>`. */
  agentHref: string;
  allRunsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? runs.filter((r) => (r.task ?? "").toLowerCase().includes(q))
    : runs;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-chip border border-navy-800/15 bg-white px-3 py-1.5 text-sm font-semibold text-navy-800/70 transition hover:border-mint-700 hover:text-mint-700"
      >
        <span aria-hidden>🕘</span>
        Recent runs
        {runs.length > 0 && (
          <span className="rounded-full bg-navy-800/8 px-1.5 text-xs font-bold text-navy-800/60">
            {runs.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute right-0 z-30 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-card border border-navy-800/12 bg-white shadow-[0_12px_40px_rgba(19,31,56,0.16)]">
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-navy-800/45">
                No runs yet.
              </p>
            ) : (
              <>
                {runs.length > 8 && (
                  <div className="border-b border-navy-800/8 p-2">
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter runs…"
                      className="w-full rounded-chip border border-navy-800/15 px-3 py-1.5 text-sm outline-none focus:border-mint-700"
                    />
                  </div>
                )}
                <ul className="max-h-96 divide-y divide-navy-800/8 overflow-y-auto">
                  {filtered.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={
                          r.conversationId
                            ? `${agentHref}?c=${r.conversationId}`
                            : `/agent-runs/${r.id}`
                        }
                        onClick={() => setOpen(false)}
                        className="block px-4 py-2.5 transition hover:bg-cream-100"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-navy-800/85">
                            {r.task?.trim() || "Standard run"}
                          </span>
                          <span
                            aria-hidden
                            title={r.status}
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              r.status === "succeeded"
                                ? "bg-mint-400"
                                : r.status === "failed"
                                  ? "bg-coral-400"
                                  : "bg-navy-800/30"
                            }`}
                          />
                        </div>
                        <span className="mt-0.5 block text-xs text-navy-800/45">
                          {new Date(r.created_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="px-4 py-4 text-center text-sm text-navy-800/45">
                      No matching runs.
                    </li>
                  )}
                </ul>
                {allRunsHref && (
                  <Link
                    href={allRunsHref}
                    onClick={() => setOpen(false)}
                    className="block border-t border-navy-800/8 px-4 py-2.5 text-center text-sm font-semibold text-mint-700 transition hover:bg-cream-100"
                  >
                    Show all runs →
                  </Link>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
