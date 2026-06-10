import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listWorkspaceWorkflows } from "@/lib/queries";
import { Card, Chip, EmptyState, ButtonLink, PageHeader } from "@/components/ui";
import { IconWorkflowNodes } from "@/components/icons";

export default async function WorkflowsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const workflows = await listWorkspaceWorkflows(session.workspaceId);

  return (
    <>
      <PageHeader
        title="Your workflows"
        description="Imported copies — edit names and prompts freely, the library originals stay untouched."
        action={<ButtonLink href="/library" variant="secondary">Browse library</ButtonLink>}
      />
      {workflows.length === 0 ? (
        <EmptyState
          icon={<IconWorkflowNodes size={48} className="text-navy-800/60" />}
          title="No workflows yet"
          description="Import your first workflow from the curated library to get started."
          action={<ButtonLink href="/library">Browse the library</ButtonLink>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {workflows.map((wf) => {
            const upgradeAvailable =
              wf.library && wf.imported_version != null
                ? wf.library.version > wf.imported_version
                : false;
            return (
              <Link key={wf.id} href={`/workflows/${wf.id}`}>
                <Card className="h-full hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-xl font-semibold">{wf.name}</h3>
                    {upgradeAvailable && (
                      <Chip tone="amber">v{wf.library!.version} available</Chip>
                    )}
                  </div>
                  <p className="text-[15px] text-navy-800/55">
                    {wf.library?.description ?? "Custom workflow"}
                  </p>
                  <p className="mt-3 font-mono text-[13px] text-navy-800/45">
                    imported v{wf.imported_version ?? "—"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
