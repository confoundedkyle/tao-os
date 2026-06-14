import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/queries";
import { listRunItems } from "@/lib/run-items";
import { CombinedRunHistory } from "@/components/combined-run-history";
import { ButtonLink, Card } from "@/components/ui";

export default async function ProjectAgentsPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId, projectId } = await params;
  const project = await getProject(session.workspaceId, projectId);
  if (!project || project.client.id !== clientId) notFound();

  const items = await listRunItems(session.workspaceId, projectId);

  return (
    <div className="space-y-6">
      <Card featured>
        <h2 className="mb-1 text-xl font-semibold">Run an agent</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          Agents read your knowledge base, query connected data sources, and
          write a result back into this project.
        </p>
        {items.length > 0 ? (
          <p className="text-sm text-navy-800/55">
            Select an agent from the list on the left to give it a task.
          </p>
        ) : (
          <div className="space-y-5">
            <HowItWorks />
            <p className="text-sm text-navy-800/55">
              No agents yet.{" "}
              <ButtonLink
                href="/library?tab=agents"
                variant="small"
                className="ml-2"
              >
                Browse the library
              </ButtonLink>
            </p>
          </div>
        )}
      </Card>

      <CombinedRunHistory
        workspaceId={session.workspaceId}
        projectId={project.id}
      />

      <p className="text-sm text-navy-800/45">
        Need a new data source?{" "}
        <Link
          href="/settings/connectors"
          className="font-semibold text-mint-700 hover:underline"
        >
          Manage connectors
        </Link>
      </p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Connect a data source",
      body: "Link Airtable, Ashby, or another source in Settings → Connectors.",
    },
    {
      n: "2",
      title: "Import an agent",
      body: "Add a ready-made agent from the Library — it comes preconfigured with the tools it needs.",
    },
    {
      n: "3",
      title: "Give it a task",
      body: "Describe what you want; the agent reads, queries, and saves a result here.",
    },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <li
          key={s.n}
          className="rounded-card border border-navy-800/10 bg-white p-4"
        >
          <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-mint-400/25 text-xs font-bold text-mint-700">
            {s.n}
          </span>
          <p className="text-sm font-semibold text-navy-800/85">{s.title}</p>
          <p className="mt-0.5 text-sm text-navy-800/55">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
