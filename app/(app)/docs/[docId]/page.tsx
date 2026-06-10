import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession } from "@/lib/auth";
import { getDocument } from "@/lib/queries";
import { DOC_TYPE_LABELS } from "@/lib/readiness";
import { Card, Chip, Mono, PageHeader } from "@/components/ui";

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

  const backHref =
    doc.scope_type === "project"
      ? null // project URL needs the client id — fall back to browser history
      : doc.scope_type === "client"
        ? `/clients/${doc.scope_id}`
        : "/settings";

  return (
    <>
      {backHref && (
        <Link href={backHref} className="mb-2 block text-sm text-navy-800/45 hover:text-mint-700">
          ← Back
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
      <Mono className="mb-4 block">
        {doc.source ?? "—"} ·{" "}
        {new Date(doc.created_at).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {doc.extracted_text
          ? ` · ~${Math.ceil(doc.extracted_text.length / 4).toLocaleString()} tokens`
          : ""}
      </Mono>
      <Card>
        {doc.doc_type === "output" ? (
          <div className="prose-calyflow">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {doc.extracted_text ?? ""}
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
