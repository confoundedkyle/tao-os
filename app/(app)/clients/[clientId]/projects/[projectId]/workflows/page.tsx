import { redirect } from "next/navigation";

// Workflows and agents are unified under the Agents tab; keep old links working.
export default async function ProjectWorkflowsPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const { clientId, projectId } = await params;
  redirect(`/clients/${clientId}/projects/${projectId}/agents`);
}
