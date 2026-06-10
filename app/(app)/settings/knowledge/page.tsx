import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDocuments } from "@/lib/queries";
import { AddDocument } from "@/components/add-document";
import { DocList } from "@/components/doc-list";
import { Card } from "@/components/ui";

export default async function WorkspaceKbPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [kbDocs, files] = await Promise.all([
    listDocuments(session.workspaceId, "workspace", session.workspaceId, "kb"),
    listDocuments(session.workspaceId, "workspace", session.workspaceId, "file"),
  ]);

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <h2 className="mb-1 text-xl font-semibold">Workspace knowledge base</h2>
        <p className="mb-5 text-sm text-navy-800/55">
          How WE work — tone of voice, screening philosophy, the markets you
          serve. Injected automatically into <strong>every</strong> workflow
          run in this workspace (capped at ~8k tokens).
        </p>
        <DocList docs={kbDocs} />
        <div className="mt-4 border-t border-navy-800/8 pt-4">
          <AddDocument
            scopeType="workspace"
            scopeId={session.workspaceId}
            kind="kb"
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-semibold">Workspace files</h2>
        <p className="mb-5 text-sm text-navy-800/55">
          Templates and internal docs. Not injected into runs — a shared shelf
          for the team.
        </p>
        <DocList docs={files} />
        <div className="mt-4 border-t border-navy-800/8 pt-4">
          <AddDocument
            scopeType="workspace"
            scopeId={session.workspaceId}
            kind="file"
          />
        </div>
      </Card>
    </div>
  );
}
