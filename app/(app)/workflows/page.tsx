import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listWorkspaceAgents } from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  requiredConnectorCategories,
} from "@/lib/connectors";
import { archiveAgentAction, restoreAgentAction } from "@/lib/actions/agents";
import { Button, Card, ButtonLink, PageHeader } from "@/components/ui";
import { AgentContextBadge } from "@/components/agent-context-badge";
import { ImportedToast } from "@/components/imported-toast";

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { imported } = await searchParams;
  const allAgents = await listWorkspaceAgents(session.workspaceId);
  const agents = allAgents.filter((a) => !a.archived_at);
  const archivedAgents = allAgents.filter((a) => a.archived_at);

  return (
    <>
      <PageHeader
        title="Agents"
        description="Your imported agents — edit their names and instructions freely; the library originals stay untouched. Run them from any project's Agents tab."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">My agents</h2>
        <ButtonLink href="/library" variant="small">
          Import from library
        </ButtonLink>
      </div>
      {agents.length === 0 ? (
        <p className="text-[15px] text-navy-800/55">
          No agents yet — import one from the{" "}
          <Link
            href="/library"
            className="font-semibold text-mint-700 hover:underline"
          >
            library
          </Link>
          . Agents run from a project&apos;s Agents tab and work with whichever
          connector you pick.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const categories = requiredConnectorCategories(
              agent.allowed_tools ?? [],
            );
            return (
              <Card
                key={agent.id}
                className={`group flex h-full flex-col p-5 ${
                  agent.id === imported ? "ring-2 ring-mint-400" : ""
                }`}
              >
                <Link href={`/agents/${agent.id}`} className="flex-1">
                  <h3 className="truncate text-[17px] font-semibold leading-tight transition group-hover:text-mint-700">
                    {agent.name}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <AgentContextBadge context={agent.library?.context} />
                    {categories.map((category) => (
                      <span
                        key={category}
                        className="rounded-full bg-navy-800/8 px-2 py-0.5 text-[11px] font-semibold text-navy-800/65"
                      >
                        any {CONNECTOR_CATEGORY_LABELS[category]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-navy-800/55">
                    {agent.library?.description ?? "Custom agent"}
                  </p>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-navy-800/8 pt-3">
                  <span className="text-xs text-navy-800/45">
                    {agent.library ? "Calyflow" : "Custom"} ·{" "}
                    <span className="font-mono">
                      v{agent.imported_version ?? "—"}
                    </span>
                  </span>
                  <form action={archiveAgentAction.bind(null, agent.id)}>
                    <button
                      type="submit"
                      className="rounded-chip border border-navy-800/12 px-2.5 py-1 text-xs font-medium text-navy-800/45 transition hover:border-navy-800/40 hover:text-navy-800"
                    >
                      Archive
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {archivedAgents.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-navy-800/50 hover:text-navy-800">
            Archived agents ({archivedAgents.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {archivedAgents.map((agent) => (
              <li
                key={agent.id}
                className="flex items-center justify-between gap-3 rounded-card border border-navy-800/10 bg-white/60 px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-sm text-navy-800/60">
                  {agent.name}
                </span>
                <form action={restoreAgentAction.bind(null, agent.id)}>
                  <Button variant="smallSecondary" type="submit">
                    Restore
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      {agents.length > 0 && (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-card border border-dashed border-navy-800/15 bg-cream-100/50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-navy-800/70">
            Need more agents?
          </p>
          <p className="max-w-md text-sm text-navy-800/55">
            Browse the curated library and import the ones you want — your copy
            is yours to rename and tweak.
          </p>
          <ButtonLink href="/library">Import from the library</ButtonLink>
        </div>
      )}

      {imported && <ImportedToast />}
    </>
  );
}
