import { requireModulePage } from "@/lib/modules";
import { listAccounts, listLeads } from "@/lib/queries";
import { CrmAccounts } from "@/components/crm-accounts";
import { CrmLeads } from "@/components/crm-leads";
import { PageHeader } from "@/components/ui";

export default async function CrmPage() {
  const session = await requireModulePage("crm");

  const [accounts, leads] = await Promise.all([
    listAccounts(session.workspaceId),
    listLeads(session.workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="CRM"
        description="Track the accounts you work with and the leads connected to them."
      />
      <CrmAccounts accounts={accounts} />
      <CrmLeads leads={leads} accounts={accounts} />
    </>
  );
}
