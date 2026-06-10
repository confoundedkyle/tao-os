import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClient, listDocuments, listProjects } from "@/lib/queries";
import { createProjectAction } from "@/lib/actions/clients";
import { saveClientKbAction } from "@/lib/actions/documents";
import { AddDocument } from "@/components/add-document";
import { DocList } from "@/components/doc-list";
import { Button, Card, Chip, inputClass, PageHeader } from "@/components/ui";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId } = await params;
  const client = await getClient(session.workspaceId, clientId);
  if (!client) notFound();

  const [projects, kbDocs, files] = await Promise.all([
    listProjects(session.workspaceId, clientId),
    listDocuments(session.workspaceId, "client", clientId, "kb"),
    listDocuments(session.workspaceId, "client", clientId, "file"),
  ]);
  const kb = kbDocs[0];

  return (
    <>
      <PageHeader
        title={client.name}
        description="Everything Calyflow knows about this client — used automatically in every run for their projects."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-xl font-semibold">Projects</h2>
          <p className="mb-4 text-sm text-navy-800/55">
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
              Open project
            </Button>
          </form>
          <ul className="divide-y divide-navy-800/8">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/clients/${client.id}/projects/${project.id}`}
                  className="font-medium hover:text-mint-700"
                >
                  {project.name}
                </Link>
                <Chip tone={project.status === "active" ? "mint" : "navy"}>
                  {project.status}
                </Chip>
              </li>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-navy-800/45">No projects yet.</p>
            )}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 text-xl font-semibold">Client knowledge base</h2>
            <p className="mb-4 text-sm text-navy-800/55">
              How THEY work — preferences and learned quirks (&quot;hates
              job-hoppers&quot;, &quot;always asks about notice periods&quot;).
              Persists across every search.
            </p>
            <form action={saveClientKbAction} className="space-y-3">
              <input type="hidden" name="clientId" value={client.id} />
              <textarea
                name="text"
                rows={6}
                defaultValue={kb?.extracted_text ?? ""}
                placeholder="- Prefers candidates from product companies&#10;- Interview process: intro call → tech screen → onsite&#10;- Hates job-hoppers"
                className={inputClass}
              />
              <Button variant="small" type="submit">
                Save notes
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-1 text-xl font-semibold">Client files</h2>
            <p className="mb-4 text-sm text-navy-800/55">
              Company deck, benefits overview, rate card — used to sell the
              company in outreach and submissions.
            </p>
            <DocList docs={files} />
            <div className="mt-4 border-t border-navy-800/8 pt-4">
              <AddDocument scopeType="client" scopeId={client.id} compact />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
