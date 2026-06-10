import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/queries";
import { setProjectStatusAction } from "@/lib/actions/clients";
import { Button, PageHeader } from "@/components/ui";
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
      <div className="mb-2 text-sm text-navy-800/45">
        <Link href="/clients" className="hover:text-mint-700">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/clients/${clientId}`} className="hover:text-mint-700">
          {project.client.name}
        </Link>
      </div>
      <PageHeader
        title={project.name}
        action={
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
        }
      />
      <ProjectTabNav
        basePath={`/clients/${clientId}/projects/${projectId}`}
      />
      {children}
    </>
  );
}
