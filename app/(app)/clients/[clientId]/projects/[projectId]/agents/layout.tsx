import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/queries";
import { listRunItems } from "@/lib/run-items";
import { ensureStarterPack } from "@/lib/starter-pack";
import { RunSidebar } from "@/components/run-sidebar";

export default async function AgentsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  // Keep the Starter Pack in sync before listing (newly-added pack workflows
  // auto-install here), matching the old workflows page behaviour.
  await ensureStarterPack(session.workspaceId);
  const items = await listRunItems(session.workspaceId, projectId);

  const baseHref = `/clients/${clientId}/projects/${projectId}/agents`;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <RunSidebar items={items} baseHref={baseHref} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
