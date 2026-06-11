import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listProspects } from "@/lib/queries";
import { TalentProspects } from "@/components/talent-prospects";
import { PageHeader } from "@/components/ui";

export default async function TalentPoolPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const prospects = await listProspects(session.workspaceId);

  return (
    <>
      <PageHeader
        title="Target Talent Pool"
        description="Build a niche pipeline of prospects — open one to attach a CV."
      />
      <TalentProspects prospects={prospects} />
    </>
  );
}
