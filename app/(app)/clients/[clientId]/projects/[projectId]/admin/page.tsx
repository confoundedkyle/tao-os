import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDocuments } from "@/lib/queries";
import { AddDocument } from "@/components/add-document";
import { DocList } from "@/components/doc-list";
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

  const projectDocs = docs.filter((d) => d.doc_type !== "cv");
  const inputDocs = docs.filter(
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
        <AddDocument
          scopeType="project"
          scopeId={projectId}
          docTypes={["jd", "intake_notes", "scorecard", "other"]}
          existingDocs={projectDocs.filter((d) => d.doc_type !== "output")}
        />
        {inputDocs.filter((d) => d.is_active).length > 0 && (
          <div className="mt-5 border-t border-navy-800/8 pt-4">
            <DocList docs={inputDocs} />
          </div>
        )}
      </Card>
    </div>
  );
}
