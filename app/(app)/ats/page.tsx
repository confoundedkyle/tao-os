import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listCandidates, listClientsWithProjects } from "@/lib/queries";
import { AtsCandidates } from "@/components/ats-candidates";
import { PageHeader } from "@/components/ui";

export default async function AtsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [candidates, clients] = await Promise.all([
    listCandidates(session.workspaceId),
    listClientsWithProjects(session.workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="ATS"
        description="Track candidates and associate them with the roles (projects) you're hiring for."
      />
      <AtsCandidates candidates={candidates} clients={clients} />
    </>
  );
}
