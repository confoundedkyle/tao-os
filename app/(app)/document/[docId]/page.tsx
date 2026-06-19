import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession } from "@/lib/auth";
import { getDocument, getProject } from "@/lib/queries";
import { DOC_TYPE_LABELS, isMarkdownDoc } from "@/lib/readiness";
import { Card, Chip, PageHeader } from "@/components/ui";
import { DownloadButtons } from "@/components/download-buttons";

// Friendly, jargon-free provenance for non-technical users.
const SOURCE_LABELS: Record<string, string> = {
  workflow: "AI-generated",
  upload: "Uploaded file",
  pasted: "Added manually",
};

export default async function DocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { docId } = await params;
  const doc = await getDocument(session.workspaceId, docId);
  if (!doc) notFound();

  const project =
    doc.scope_type === "project"
      ? await getProject(session.workspaceId, doc.scope_id)
      : null;

  const backHref =
    project
      ? `/clients/${project.client.id}/projects/${project.id}`
      : doc.scope_type === "client"
        ? `/clients/${doc.scope_id}`
        : "/knowledge";

  return (
    <>
      {backHref && (
        <Link href={backHref} className="mb-4 inline-block text-sm text-navy-800/45 hover:text-mint-700">
          ←{" "}
          {project
            ? `${project.client.name} / ${project.name}`
            : doc.scope_type === "client"
              ? "Back to project"
              : "Knowledge Base"}
        </Link>
      )}
      <PageHeader
        title={doc.filename ?? "Untitled"}
        action={
          <div className="flex items-center gap-2">
            {doc.doc_type && (
              <Chip tone={doc.doc_type === "output" ? "sky" : "navy"}>
                {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
              </Chip>
            )}
            {!doc.is_active && <Chip tone="amber">archived</Chip>}
          </div>
        }
      />
      <p className="mb-4 text-sm text-navy-800/50">
        {SOURCE_LABELS[doc.source ?? ""] ?? "Document"} ·{" "}
        {new Date(doc.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      {doc.extracted_text && (
        <div className="mb-4">
          <DownloadButtons
            text={doc.extracted_text}
            filename={doc.filename ?? "document"}
          />
        </div>
      )}
      <Card>
        {doc.extracted_text && isMarkdownDoc(doc) ? (
          <div className="prose-calyflow">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {doc.extracted_text}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[15.5px]">
            {doc.extracted_text ?? "(no text extracted)"}
          </pre>
        )}
      </Card>
    </>
  );
}
