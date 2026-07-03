import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject, listConnections } from "@/lib/queries";
import { listCandidates, countQualified } from "@/lib/candidates/queries";
import { connectedProvidersFrom } from "@/lib/run-items";
import { emailEnrichmentConnectors } from "@/lib/connectors";
import { ShortlistPanel } from "@/components/shortlist-panel";

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const [candidates, qualified, connections] = await Promise.all([
    listCandidates(projectId),
    countQualified(projectId),
    listConnections(session.workspaceId),
  ]);

  const basePath = `/clients/${clientId}/projects/${projectId}`;
  const connectedProviders = connectedProvidersFrom(connections);
  const connectedEnrichment = emailEnrichmentConnectors(connectedProviders);

  return (
    <ShortlistPanel
      projectId={project.id}
      candidates={candidates}
      qualifiedCount={qualified}
      connectedEnrichment={connectedEnrichment}
      connectorsHref="/settings/connectors"
      sourcingHref={`${basePath}/sourcing`}
    />
  );
}
