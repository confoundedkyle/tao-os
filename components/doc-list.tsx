import Link from "next/link";
import { setDocumentActiveAction } from "@/lib/actions/documents";
import { DOC_TYPE_LABELS } from "@/lib/readiness";
import type { Doc } from "@/lib/types";
import { Chip, Mono } from "./ui";
import { LocalDateTime } from "./local-datetime";
import { DeleteDocButton } from "./delete-doc-button";

export function DocList({ docs }: { docs: Doc[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-navy-800/45">No documents yet.</p>;
  }
  return (
    <ul className="divide-y divide-navy-800/8">
      {docs.map((doc) => (
        <li key={doc.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <Link
              href={`/docs/${doc.id}`}
              className={`font-medium hover:text-mint-700 ${doc.is_active ? "" : "text-navy-800/40 line-through"}`}
            >
              {doc.filename ?? "Untitled"}
            </Link>
            <Mono className="ml-2">
              <LocalDateTime iso={doc.created_at} />
            </Mono>
          </div>
          {doc.doc_type && doc.doc_type !== "other" && (
            <Chip tone={doc.doc_type === "output" ? "sky" : "navy"}>
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            </Chip>
          )}
          {!doc.is_active && <Chip tone="amber">archived</Chip>}
          {doc.doc_type === "jd" && !doc.is_active && (
            <form action={setDocumentActiveAction.bind(null, doc.id, true)}>
              <button className="text-sm font-semibold text-mint-700 hover:underline">
                Make active
              </button>
            </form>
          )}
          <DeleteDocButton docId={doc.id} filename={doc.filename} />
        </li>
      ))}
    </ul>
  );
}
