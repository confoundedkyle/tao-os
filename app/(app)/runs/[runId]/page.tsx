import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession } from "@/lib/auth";
import { getRun, getDocument } from "@/lib/queries";
import { providerLabel } from "@/lib/providers";
import { Card, Chip, Mono, PageHeader } from "@/components/ui";
import { IconWarning } from "@/components/icons";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { runId } = await params;
  const run = await getRun(session.workspaceId, runId);
  if (!run) notFound();

  const inputDocs = await Promise.all(
    (run.input_doc_ids ?? []).map((id) => getDocument(session.workspaceId, id)),
  );

  return (
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link
          href={`/clients/${run.project.client.id}/projects/${run.project.id}`}
          className="hover:text-mint-700"
        >
          ← {run.project.name}
        </Link>
      </div>
      <PageHeader
        title={run.workflow?.name ?? "Workflow run"}
        action={
          <Chip
            tone={
              run.status === "succeeded"
                ? "mint"
                : run.status === "failed"
                  ? "coral"
                  : "sky"
            }
          >
            {run.status}
          </Chip>
        }
      />

      {run.fallback_used && (
        <div className="mb-6 flex items-center gap-3 rounded-card border border-amber-400/40 bg-amber-400/10 px-4 py-3">
          <IconWarning className="shrink-0" />
          <p className="text-sm">
            This run was served by a <strong>fallback provider</strong> — the
            primary was unavailable. Output style may differ slightly.
          </p>
        </div>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Run details</h2>
        <dl className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
          <Row label="Provider" value={run.provider ? providerLabel(run.provider) : "—"} />
          <Row label="Model" value={<Mono className="!text-[14px]">{run.model ?? "—"}</Mono>} />
          <Row
            label="Tokens"
            value={
              <Mono className="!text-[14px]">
                {run.input_tokens?.toLocaleString() ?? "—"} in /{" "}
                {run.output_tokens?.toLocaleString() ?? "—"} out
                {run.cache_read_tokens
                  ? ` (${run.cache_read_tokens.toLocaleString()} cached)`
                  : ""}
              </Mono>
            }
          />
          <Row
            label="Cost"
            value={
              <Mono className="!text-[14px]">
                {run.cost_usd != null ? `$${Number(run.cost_usd).toFixed(6)}` : "—"}
              </Mono>
            }
          />
          <Row
            label="Started"
            value={new Date(run.created_at).toLocaleString("en-GB")}
          />
          <Row label="By" value={run.created_by ?? "—"} />
        </dl>
        {run.error_message && (
          <p className="mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
            {run.error_message}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Input documents</h2>
            {inputDocs.filter(Boolean).length === 0 ? (
              <p className="text-sm text-navy-800/45">
                No documents selected — ran from project context only.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {inputDocs.map(
                  (doc) =>
                    doc && (
                      <li key={doc.id}>
                        <Link href={`/docs/${doc.id}`} className="font-medium hover:text-mint-700">
                          {doc.filename}
                        </Link>
                      </li>
                    ),
                )}
              </ul>
            )}
          </Card>

          {(run.context_notes ?? []).length > 0 && (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Context notes</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-navy-800/70">
                {run.context_notes!.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <details>
              <summary className="cursor-pointer text-lg font-semibold">
                Rendered prompt{" "}
                <span className="text-sm font-normal text-navy-800/45">
                  (exactly what the model saw)
                </span>
              </summary>
              <pre className="mt-3 max-h-130 overflow-auto whitespace-pre-wrap rounded-card bg-cream-100 p-4 font-mono text-[12.5px] leading-relaxed">
                {run.rendered_prompt ?? "(not recorded)"}
              </pre>
            </details>
          </Card>
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Output</h2>
            {run.output_doc_id && (
              <Link
                href={`/docs/${run.output_doc_id}`}
                className="text-sm font-semibold text-mint-700 hover:underline"
              >
                Saved as project file →
              </Link>
            )}
          </div>
          {run.model_response ? (
            <div className="prose-calyflow">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {run.model_response}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-navy-800/45">No output recorded.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-navy-800/6 pb-1.5">
      <dt className="text-navy-800/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
