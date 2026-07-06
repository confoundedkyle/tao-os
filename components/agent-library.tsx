"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  connectorLabel,
  connectorsForCategory,
  providersFromTools,
  requiredConnectorCategories,
} from "@/lib/connectors";
import { importAgentAction } from "@/lib/actions/agents";
import { deriveAgentGraph } from "@/lib/workflow-graph";
import { Button, Card, Chip } from "@/components/ui";
import { WorkflowPreviewDialog } from "@/components/workflow-preview-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { AgentContextBadge } from "@/components/agent-context-badge";
import type { Connection, LibraryAgent } from "@/lib/types";

const UPSTREAM_AUTHOR = "Michal Juhas";
const FORK_AUTHOR = "Kyle Byrd";
/** Agents original to TAO OS; everything else is upstream Calyflow work. */
const FORK_AGENT_SLUGS = new Set(["leadership-sourcer"]);

const CATEGORY_BY_PROVIDER = new Map(
  CONNECTORS.filter((c) => c.provider).map((c) => [c.provider!, c.category]),
);

/** First `n` words of a string, with an ellipsis if it was longer. */
function firstWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : `${words.slice(0, n).join(" ")}…`;
}

export function AgentLibrary({
  agents,
  importedAgentIds,
  connections,
  model,
}: {
  agents: LibraryAgent[];
  importedAgentIds: string[];
  connections: Connection[];
  model: { providerLabel: string; modelId: string } | null;
}) {
  const [query, setQuery] = useState("");
  const connectedProviders = new Set(connections.map((c) => c.provider));
  const imported = new Set(importedAgentIds);

  if (agents.length === 0) {
    return (
      <p className="text-navy-800/55">
        No agents in the library yet — run the seed script (
        <span className="font-mono text-[13px]">npx tsx scripts/seed.ts</span>
        ) to load them.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? agents.filter((a) =>
        `${a.name} ${a.description}`.toLowerCase().includes(q),
      )
    : agents;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search agents by name or description…"
        className="w-full rounded-card border border-navy-800/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-mint-700"
      />
      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-navy-800/45">
          No agents match “{query}”.
        </p>
      )}
      {filtered.map((agent) => {
        const isImported = imported.has(agent.id);
        const categories = requiredConnectorCategories(agent.allowed_tools ?? []);
        const slots = categories.map((cat) => {
          const connected = connectorsForCategory(cat).filter(
            (c) => c.provider && connectedProviders.has(c.provider),
          );
          return {
            category: cat,
            categoryLabel: CONNECTOR_CATEGORY_LABELS[cat],
            selectedProvider: connected[0]?.provider ?? null,
            selectedLabel: connected[0]?.name,
            connectedNames: connected.map((c) => c.provider!),
          };
        });
        // Provider-bound connectors (e.g. GitHub, Coresignal) the agent needs.
        const bound = providersFromTools(agent.allowed_tools ?? []).map(
          (provider) => ({
            provider,
            name: connectorLabel(provider),
            category: CATEGORY_BY_PROVIDER.get(provider) ?? "tool",
            connected: connectedProviders.has(provider),
          }),
        );
        return (
          <Card key={agent.id} className="p-5">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-lg font-semibold">{agent.name}</h3>
                  <AgentContextBadge context={agent.context} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-navy-800/45">
                    <WorkflowPreviewDialog
                      name={agent.name}
                      description={agent.description}
                      graph={deriveAgentGraph({
                        name: agent.name,
                        connectors: slots,
                        boundProviders: providersFromTools(
                          agent.allowed_tools ?? [],
                        ),
                        model,
                        slug: agent.slug,
                        description: agent.description,
                        instructions: agent.instructions,
                      })}
                    />
                    <span>
                      <span className="font-mono">v{agent.version}</span> · by{" "}
                      {FORK_AGENT_SLUGS.has(agent.slug) ? FORK_AUTHOR : UPSTREAM_AUTHOR}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-navy-800/55">
                  {firstWords(agent.description, 40)}
                </p>
                {(slots.length > 0 || bound.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-navy-800/40">Needs:</span>
                    {bound.map((b) => (
                      <Link
                        key={b.provider}
                        href={`/settings/connectors?category=${b.category}`}
                        title={
                          b.connected
                            ? `${b.name} connected — view connectors`
                            : `Connect ${b.name}`
                        }
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition hover:brightness-95 hover:underline ${
                          b.connected
                            ? "bg-mint-400/20 text-mint-700"
                            : "bg-coral-400/15 text-coral-400"
                        }`}
                      >
                        {b.connected ? "✓" : "○"} {b.name}
                      </Link>
                    ))}
                    {slots.map((slot) => {
                      const names = slot.connectedNames.map(connectorLabel);
                      const connected = names.length > 0;
                      return (
                        <Link
                          key={slot.category}
                          href={`/settings/connectors?category=${slot.category}`}
                          title={
                            connected
                              ? `Connected: ${names.join(", ")} — view connectors`
                              : `View ${slot.categoryLabel} connectors`
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition hover:brightness-95 hover:underline ${
                            connected
                              ? "bg-mint-400/20 text-mint-700"
                              : "bg-amber-400/15 text-navy-800/65"
                          }`}
                        >
                          {connected ? "✓" : "○"} any {slot.categoryLabel}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-navy-800/40">Uses:</span>
                  <PromptDialog name={agent.name} prompt={agent.instructions} />
                </div>
              </div>
              <div className="shrink-0">
                {isImported ? (
                  <Chip tone="mint">✓ Imported</Chip>
                ) : (
                  <form action={importAgentAction.bind(null, agent.id)}>
                    <Button variant="small" type="submit">
                      Import
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
