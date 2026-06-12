import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listWorkspaceAgents, listWorkspaceWorkflows } from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  requiredConnectorCategories,
} from "@/lib/connectors";
import {
  archiveAgentAction,
  restoreAgentAction,
} from "@/lib/actions/agents";
import {
  archiveWorkflowAction,
  restoreWorkflowAction,
} from "@/lib/actions/workflows";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ButtonLink,
  PageHeader,
} from "@/components/ui";
import { IconWorkflowNodes } from "@/components/icons";
import { ImportedToast } from "@/components/imported-toast";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { imported } = await searchParams;
  const [allWorkflows, allAgents] = await Promise.all([
    listWorkspaceWorkflows(session.workspaceId),
    listWorkspaceAgents(session.workspaceId),
  ]);
  const workflows = allWorkflows.filter((w) => !w.archived_at);
  const archivedWorkflows = allWorkflows.filter((w) => w.archived_at);
  const agents = allAgents.filter((a) => !a.archived_at);
  const archivedAgents = allAgents.filter((a) => a.archived_at);

  return (
    <>
      <PageHeader
        title="Workflows & agents"
        description="Your imported copies — edit names and prompts freely, the library originals stay untouched."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">My workflows</h2>
        <div className="flex items-center gap-3">
          <ButtonLink href="/library" variant="small">
            Import from library
          </ButtonLink>
          <ButtonLink href="/workflows/new" variant="smallSecondary">
            Create from scratch
          </ButtonLink>
        </div>
      </div>
      {workflows.length === 0 ? (
        <EmptyState
          icon={<IconWorkflowNodes size={48} className="text-navy-800/60" />}
          title="No workflows yet"
          description="Import one from the curated library, or write your own from scratch."
          action={
            <div className="flex items-center gap-3">
              <ButtonLink href="/library">Import from library</ButtonLink>
              <ButtonLink href="/workflows/new" variant="secondary">
                Create from scratch
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {workflows.map((wf) => {
            const upgradeAvailable =
              wf.library && wf.imported_version != null
                ? wf.library.version > wf.imported_version
                : false;
            return (
              <Card
                key={wf.id}
                className={`flex h-full flex-col hover:shadow-lift ${
                  wf.id === imported ? "ring-2 ring-mint-400" : ""
                }`}
              >
                <Link
                  href={`/workflows/${wf.id}`}
                  className="group block flex-1"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-xl font-semibold transition group-hover:text-mint-700">
                      {wf.name}
                    </h3>
                    {upgradeAvailable && (
                      <Chip tone="amber">v{wf.library!.version} available</Chip>
                    )}
                  </div>
                  <p className="text-[15px] text-navy-800/55">
                    {wf.library?.description ?? "Custom workflow"}
                  </p>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[13px] text-navy-800/45">
                    imported v{wf.imported_version ?? "—"}
                  </span>
                  <form action={archiveWorkflowAction.bind(null, wf.id)}>
                    <button
                      type="submit"
                      className="rounded-chip border border-navy-800/15 px-3 py-1 text-xs font-semibold text-navy-800/55 transition hover:border-navy-800/40 hover:text-navy-800"
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

      {archivedWorkflows.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-navy-800/50 hover:text-navy-800">
            Archived workflows ({archivedWorkflows.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {archivedWorkflows.map((wf) => (
              <li
                key={wf.id}
                className="flex items-center justify-between gap-3 rounded-card border border-navy-800/10 bg-white/60 px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-sm text-navy-800/60">
                  {wf.name}
                </span>
                <form action={restoreWorkflowAction.bind(null, wf.id)}>
                  <Button variant="smallSecondary" type="submit">
                    Restore
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">My agents</h2>
        <ButtonLink href="/library?tab=agents" variant="small">
          Import from library
        </ButtonLink>
      </div>
      {agents.length === 0 ? (
        <p className="text-[15px] text-navy-800/55">
          No agents yet — import one from the{" "}
          <Link
            href="/library?tab=agents"
            className="font-semibold text-mint-700 hover:underline"
          >
            library
          </Link>
          . Agents run from a project&apos;s Agents tab and work with whichever
          connector you pick.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {agents.map((agent) => {
            const categories = requiredConnectorCategories(
              agent.allowed_tools ?? [],
            );
            return (
              <Card key={agent.id} className="flex h-full flex-col">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-xl font-semibold">{agent.name}</h3>
                  <Chip tone="sky">agent</Chip>
                </div>
                <p className="flex-1 text-[15px] text-navy-800/55">
                  {agent.library?.description ?? "Custom agent"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-mono text-[13px] text-navy-800/45">
                    imported v{agent.imported_version ?? "—"}
                  </span>
                  {categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-navy-800/8 px-2 py-0.5 text-xs font-semibold text-navy-800/70"
                    >
                      any {CONNECTOR_CATEGORY_LABELS[category]}
                    </span>
                  ))}
                  <form
                    action={archiveAgentAction.bind(null, agent.id)}
                    className="ml-auto"
                  >
                    <button
                      type="submit"
                      className="rounded-chip border border-navy-800/15 px-3 py-1 text-xs font-semibold text-navy-800/55 transition hover:border-navy-800/40 hover:text-navy-800"
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

      {imported && <ImportedToast />}
    </>
  );
}
