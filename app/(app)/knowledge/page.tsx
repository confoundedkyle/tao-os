import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listDocuments } from "@/lib/queries";
import { DocExplorer } from "@/components/doc-explorer";

export default async function KnowledgeBasePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const docs = await listDocuments(
    session.workspaceId,
    "workspace",
    session.workspaceId,
    "kb",
  );

  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-navy-800/55">
        Your agency&apos;s context — tone of voice, screening philosophy, the
        markets you serve. The AI reads this before every run.{" "}
        <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-mint-400/20 px-2.5 py-0.5 align-middle text-xs font-semibold text-mint-700">
          Auto-injected into every run
        </span>
      </p>
      <DocExplorer
        scopeType="workspace"
        scopeId={session.workspaceId}
        docs={docs}
        mode="kb"
      />
    </>
  );
}
