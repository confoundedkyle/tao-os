import { requireModulePage } from "@/lib/modules";
import { listProspects } from "@/lib/queries";
import { TalentProspects } from "@/components/talent-prospects";

export default async function TalentPoolPage() {
  const session = await requireModulePage("talent_pool");

  const prospects = await listProspects(session.workspaceId);

  return <TalentProspects prospects={prospects} />;
}
