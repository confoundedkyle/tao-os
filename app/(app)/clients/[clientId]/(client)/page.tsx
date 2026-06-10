import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClient, listProjects } from "@/lib/queries";
import {
  createProjectAction,
  setProjectStatusAction,
} from "@/lib/actions/clients";
import { Button, Card, Mono, inputClass } from "@/components/ui";

export default async function ClientProjectsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId } = await params;
  const client = await getClient(session.workspaceId, clientId);
  if (!client) notFound();

  const projects = await listProjects(session.workspaceId, clientId);
  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status !== "active");

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-1 text-xl font-semibold">Projects</h2>
        <p className="mb-5 text-sm text-navy-800/55">
          One project per role you&apos;re filling.
        </p>
        <form action={createProjectAction} className="mb-5 flex gap-3">
          <input type="hidden" name="clientId" value={client.id} />
          <input
            name="name"
            required
            placeholder='e.g. "Senior DevOps – Berlin"'
            className={inputClass}
          />
          <Button variant="small" type="submit" className="shrink-0">
            + New project
          </Button>
        </form>

        {active.length === 0 && archived.length === 0 ? (
          <p className="text-sm text-navy-800/45">
            No projects yet — create your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-navy-800/8">
            {active.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/clients/${client.id}/projects/${project.id}`}
                    className="font-medium hover:text-mint-700"
                  >
                    {project.name}
                  </Link>
                  <Mono className="ml-2">
                    {new Date(project.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Mono>
                </div>
                <form
                  action={setProjectStatusAction.bind(null, project.id, "archived")}
                >
                  <button className="shrink-0 rounded-chip border border-navy-800/15 px-3 py-1 text-xs font-medium text-navy-800/55 transition hover:border-navy-800/40 hover:text-navy-900">
                    Archive
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {archived.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-navy-800/40">
            Archived
          </h3>
          <ul className="divide-y divide-navy-800/8">
            {archived.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <Link
                  href={`/clients/${client.id}/projects/${project.id}`}
                  className="min-w-0 truncate font-medium text-navy-800/45 hover:text-mint-700"
                >
                  {project.name}
                </Link>
                <form
                  action={setProjectStatusAction.bind(null, project.id, "active")}
                >
                  <button className="shrink-0 rounded-chip border border-mint-700/30 px-3 py-1 text-xs font-semibold text-mint-700 transition hover:bg-mint-400/10">
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
