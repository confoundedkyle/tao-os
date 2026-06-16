"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setAgentRunArchivedAction } from "@/lib/actions/agents";
import { Card, Chip, Mono } from "@/components/ui";

export interface AgentRunRow {
  id: string;
  conversationId: string | null;
  name: string;
  task: string | null;
  status: "running" | "succeeded" | "failed";
  model: string | null;
  costUsd: number | null;
  createdAt: string;
  runner: string | null;
  archived: boolean;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ArchiveButton({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setAgentRunArchivedAction(id, !archived);
          router.refresh();
        })
      }
      className="inline-flex shrink-0 items-center gap-1 rounded-chip border border-navy-800/15 px-2 py-1 text-xs font-semibold text-navy-800/55 transition hover:border-navy-800/30 hover:bg-cream-100 hover:text-navy-800 disabled:opacity-50"
    >
      <span aria-hidden>{archived ? "↩" : "🗄"}</span>
      {pending ? "…" : archived ? "Restore" : "Archive"}
    </button>
  );
}

export function AgentRunsList({
  title,
  rows,
  agentHref,
}: {
  title: string;
  rows: AgentRunRow[];
  /** Agent page, so a run opens its chat at `${agentHref}?c=<conversationId>`. */
  agentHref: string;
}) {
  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);
  const [showArchived, setShowArchived] = useState(false);
  const runHref = (r: AgentRunRow) =>
    r.conversationId ? `${agentHref}?c=${r.conversationId}` : `/agent-runs/${r.id}`;

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        {active.length === 0 ? (
          <p className="text-sm text-navy-800/45">No active runs.</p>
        ) : (
          <ul className="divide-y divide-navy-800/8">
            {active.map((item) => (
              <li
                key={item.id}
                className="group flex items-start justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={runHref(item)}
                    className="block min-w-0 truncate font-medium hover:text-mint-700"
                  >
                    {item.name}
                    {item.task ? (
                      <span className="text-navy-800/45"> — {item.task}</span>
                    ) : null}
                  </Link>
                  <Mono>
                    {when(item.createdAt)}
                    {" · "}
                    {item.model ?? "—"}
                    {" · "}
                    {item.costUsd != null
                      ? `$${Number(item.costUsd).toFixed(4)}`
                      : "—"}
                    {item.runner ? ` · by ${item.runner}` : ""}
                  </Mono>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ArchiveButton id={item.id} archived={false} />
                  <Chip
                    tone={
                      item.status === "succeeded"
                        ? "mint"
                        : item.status === "failed"
                          ? "coral"
                          : "sky"
                    }
                  >
                    {item.status}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {archived.length > 0 && (
        <div className="rounded-card border border-navy-800/8 bg-cream-100/40 px-5 py-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="flex w-full items-center gap-1.5 text-sm font-semibold text-navy-800/45 transition hover:text-navy-800/70"
          >
            <span
              aria-hidden
              className={`inline-block text-[11px] transition-transform ${showArchived ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            Archived runs ({archived.length})
            <span className="font-normal text-navy-800/35">
              — kept for cost &amp; activity tracking
            </span>
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-navy-800/8">
              {archived.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center justify-between gap-3 py-1.5 text-navy-800/50"
                >
                  <Link
                    href={runHref(item)}
                    className="min-w-0 flex-1 truncate text-sm hover:text-mint-700"
                  >
                    {item.task?.trim() || item.name}
                    <span className="ml-2 font-mono text-[11px] text-navy-800/35">
                      {when(item.createdAt)}
                      {item.costUsd != null
                        ? ` · $${Number(item.costUsd).toFixed(4)}`
                        : ""}
                      {item.runner ? ` · by ${item.runner}` : ""}
                    </span>
                  </Link>
                  <ArchiveButton id={item.id} archived={true} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
