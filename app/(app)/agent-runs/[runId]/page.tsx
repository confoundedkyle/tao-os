import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAgentRun } from "@/lib/queries";

/** A run belongs to a conversation; opening it now lands on that chat (?c=<id>)
 *  rather than a separate per-run page — the chat shows the run's steps, output,
 *  and saved document in context, and is shareable. */
export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { runId } = await params;
  const run = await getAgentRun(session.workspaceId, runId);
  if (!run) notFound();

  const base = `/clients/${run.project.client.id}/projects/${run.project.id}/agents/${run.workspace_agent_id}`;
  redirect(run.conversation_id ? `${base}?c=${run.conversation_id}` : base);
}
