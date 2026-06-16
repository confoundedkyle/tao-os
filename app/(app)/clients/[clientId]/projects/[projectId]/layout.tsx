import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/queries";
import { setProjectStatusAction } from "@/lib/actions/clients";
import { Button } from "@/components/ui";
import { ProjectTabNav } from "@/components/project-tab-nav";

export default async function ProjectLayout({
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

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="text-xs text-navy-800/45">
            <Link href="/clients" className="hover:text-mint-700">
              Projects
            </Link>{" "}
            /{" "}
            <Link href={`/clients/${clientId}`} className="hover:text-mint-700">
              {project.client.name}
            </Link>
          </div>
          <h1 className="text-xl font-bold leading-tight">{project.name}</h1>
        </div>
        <form
          action={setProjectStatusAction.bind(
            null,
            project.id,
            project.status === "active" ? "archived" : "active",
          )}
        >
          <Button variant="smallSecondary" type="submit">
            {project.status === "active" ? "Archive project" : "Reactivate"}
          </Button>
        </form>
      </div>
      <ProjectTabNav
        basePath={`/clients/${clientId}/projects/${projectId}`}
      />
      {children}
    </>
  );
}
