import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDocuments } from "@/lib/queries";
import { ProjectFilesManager } from "@/components/project-files-manager";
import { Card } from "@/components/ui";

export default async function ProjectAdminPage({
  params,
}: {
  params: Promise<{ clientId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { projectId } = await params;

  const docs = await listDocuments(session.workspaceId, "project", projectId, "file");

  // All project file docs (active + archived JD history), excluding CVs (a
  // per-run input) and workflow outputs (shown on the Workflows tab).
  const projectDocs = docs.filter(
    (d) => d.doc_type !== "cv" && d.doc_type !== "output",
  );

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <h2 className="mb-1 text-xl font-semibold">Project files</h2>
        <p className="mb-5 text-sm text-navy-800/55">
          JD, intake notes, scorecard — set once, reused on every run. A new JD
          automatically archives the old one.
        </p>
        <ProjectFilesManager scopeId={projectId} docs={projectDocs} />
      </Card>
    </div>
  );
}
