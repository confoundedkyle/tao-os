import { requireModulePage } from "@/lib/modules";
import { listCandidates, listClientsWithProjects } from "@/lib/queries";
import { AtsCandidates } from "@/components/ats-candidates";

export default async function AtsPage() {
  const session = await requireModulePage("ats");

  const [candidates, clients] = await Promise.all([
    listCandidates(session.workspaceId),
    listClientsWithProjects(session.workspaceId),
  ]);

  return <AtsCandidates candidates={candidates} clients={clients} />;
}
