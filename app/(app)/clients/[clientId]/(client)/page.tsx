import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClient, listProjects } from "@/lib/queries";
import { setProjectStatusAction } from "@/lib/actions/clients";
import { Card } from "@/components/ui";
import { IconFolder } from "@/components/icons";
import { AddProject } from "@/components/add-project";

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

        <AddProject clientId={client.id} />

        {active.length === 0 && archived.length === 0 ? (
          <p className="text-sm text-navy-800/45">
            No projects yet — add your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((project) => (
              <li
                key={project.id}
                className="group flex items-center gap-3 rounded-card border border-navy-800/10 bg-white px-4 py-3 transition hover:border-mint-700/40 hover:shadow-[0_2px_12px_rgba(19,31,56,0.06)]"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint-400/12 text-mint-700">
                  <IconFolder size={18} />
                </span>
                <Link
                  href={`/clients/${client.id}/projects/${project.id}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate font-semibold text-navy-900 transition group-hover:text-mint-700">
                    {project.name}
                  </span>
                  <span className="text-xs text-navy-800/45">
                    Created{" "}
                    {new Date(project.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </Link>
                <form
                  action={setProjectStatusAction.bind(null, project.id, "archived")}
                >
                  <button className="shrink-0 rounded-chip border border-navy-800/12 px-3 py-1 text-xs font-medium text-navy-800/45 opacity-0 transition hover:border-navy-800/40 hover:text-navy-900 focus:opacity-100 group-hover:opacity-100">
                    Archive
                  </button>
                </form>
                <span
                  aria-hidden
                  className="text-lg leading-none text-navy-800/20 transition group-hover:translate-x-0.5 group-hover:text-mint-700"
                >
                  ›
                </span>
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
