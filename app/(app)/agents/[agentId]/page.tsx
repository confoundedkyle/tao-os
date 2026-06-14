import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getPrimaryRunModel,
  listConnections,
  listWorkspaceAgents,
} from "@/lib/queries";
import { deriveAgentGraph } from "@/lib/workflow-graph";
import { agentRequirements, connectedProvidersFrom } from "@/lib/run-items";
import {
  archiveAgentAction,
  deleteAgentAction,
  restoreAgentAction,
  updateAgentAction,
  upgradeAgentAction,
} from "@/lib/actions/agents";
import {
  Button,
  Card,
  Chip,
  Field,
  inputClass,
  PageHeader,
} from "@/components/ui";
import { WorkflowCanvas } from "@/components/workflow-canvas";
import { AgentContextBadge } from "@/components/agent-context-badge";

export default async function AgentEditPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { agentId } = await params;

  const [agents, model, connections] = await Promise.all([
    listWorkspaceAgents(session.workspaceId),
    getPrimaryRunModel(session.workspaceId),
    listConnections(session.workspaceId),
  ]);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) notFound();

  const requirements = agentRequirements(
    agent.allowed_tools ?? [],
    connectedProvidersFrom(connections),
  );
  const graph = deriveAgentGraph({
    name: agent.name,
    connectors: requirements.map((req) => ({
      category: req.category,
      categoryLabel: req.label,
      selectedProvider: req.options[0]?.provider ?? null,
      selectedLabel: req.options[0]?.label,
    })),
    model,
    slug: agent.library?.slug,
    description: agent.library?.description,
    instructions: agent.instructions,
  });

  const upgradeAvailable =
    agent.library && agent.imported_version != null
      ? agent.library.version > agent.imported_version
      : false;

  return (
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link href="/workflows" className="hover:text-mint-700">
          Agents
        </Link>{" "}
        / {agent.name}
      </div>
      <PageHeader
        title={agent.name}
        description={agent.library?.description}
        action={
          upgradeAvailable ? (
            <form action={upgradeAgentAction.bind(null, agent.id)}>
              <Chip tone="amber" className="mr-3">
                v{agent.library!.version} available
              </Chip>
              <Button variant="smallSecondary" type="submit">
                Upgrade to v{agent.library!.version}
              </Button>
            </form>
          ) : agent.archived_at ? (
            <Chip tone="amber">Archived</Chip>
          ) : (
            <Chip tone="mint">
              v{agent.imported_version ?? "custom"} · up to date
            </Chip>
          )
        }
      />

      <div className="-mt-4 mb-6">
        <AgentContextBadge context={agent.library?.context} />
      </div>

      <Card className="mb-6">
        <h2 className="mb-1 text-xl font-semibold">How this agent runs</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          What the agent reads, the tools it can use, and what it writes back.
        </p>
        <WorkflowCanvas graph={graph} />
      </Card>

      <Card>
        <form action={updateAgentAction} className="space-y-5">
          <input type="hidden" name="agentId" value={agent.id} />
          <Field label="Name">
            <input
              name="name"
              defaultValue={agent.name}
              required
              className={inputClass}
            />
          </Field>
          <Field
            label="Skill (instructions)"
            hint="How the agent works. The project, client, and workspace knowledge are injected automatically at run time; the agent reads CVs and other files with its tools."
          >
            <textarea
              name="instructions"
              defaultValue={agent.instructions}
              rows={26}
              className={`${inputClass} font-mono text-[13px] leading-relaxed`}
            />
          </Field>
          <div className="flex items-center justify-between">
            <Button type="submit">Save changes</Button>
          </div>
        </form>
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-navy-800/10 pt-4">
          {agent.archived_at ? (
            <form action={restoreAgentAction.bind(null, agent.id)}>
              <Button variant="smallSecondary" type="submit">
                Restore from archive
              </Button>
            </form>
          ) : (
            <form action={archiveAgentAction.bind(null, agent.id)}>
              <Button variant="smallSecondary" type="submit">
                Archive
              </Button>
            </form>
          )}
          <form action={deleteAgentAction.bind(null, agent.id)}>
            <Button variant="danger" type="submit">
              Remove from workspace
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}
