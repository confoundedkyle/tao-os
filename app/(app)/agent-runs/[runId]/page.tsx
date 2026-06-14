import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession } from "@/lib/auth";
import { getAgentRun, getDocument } from "@/lib/queries";
import { providerLabel } from "@/lib/providers";
import { Card, Chip, Mono, PageHeader } from "@/components/ui";
import { DownloadButtons } from "@/components/download-buttons";

const TOOL_LABELS: Record<string, string> = {
  calyflow_search_documents: "Searched knowledge base",
  calyflow_read_document: "Read document",
  calyflow_create_document: "Saved document",
  gmail_send_email: "Sent email (Gmail)",
  outlook_send_email: "Sent email (Outlook)",
};

function toolLabel(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  const [prefix, ...rest] = tool.split("_");
  return rest.length ? `${prefix} · ${rest.join(" ")}` : tool;
}

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { runId } = await params;
  const run = await getAgentRun(session.workspaceId, runId);
  if (!run) notFound();

  const outputDoc = run.output_doc_id
    ? await getDocument(session.workspaceId, run.output_doc_id)
    : null;

  return (
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link
          href={`/clients/${run.project.client.id}/projects/${run.project.id}/agents`}
          className="hover:text-mint-700"
        >
          ← {run.project.name}
        </Link>
      </div>
      <PageHeader
        title={run.agent?.name ?? "Agent run"}
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

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Run details</h2>
        <dl className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
          <Row
            label="Provider"
            value={run.provider ? providerLabel(run.provider) : "—"}
          />
          <Row
            label="Model"
            value={<Mono className="!text-[14px]">{run.model ?? "—"}</Mono>}
          />
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
                {run.cost_usd != null
                  ? `$${Number(run.cost_usd).toFixed(6)}`
                  : "—"}
              </Mono>
            }
          />
          <Row
            label="Started"
            value={new Date(run.created_at).toLocaleString("en-GB")}
          />
          <Row label="By" value={run.created_by ?? "—"} />
        </dl>
        {run.task && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-navy-800/35">
              Task
            </p>
            <p className="whitespace-pre-wrap rounded-card bg-cream-100 px-3 py-2.5 text-sm text-navy-800/80">
              {run.task}
            </p>
          </div>
        )}
        {run.error_message && (
          <p className="mt-4 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
            {run.error_message}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">What the agent did</h2>
          {(run.steps ?? []).length === 0 ? (
            <p className="text-sm text-navy-800/45">No tool steps recorded.</p>
          ) : (
            <ol className="space-y-1.5">
              {run.steps!.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span aria-hidden className="mt-0.5 shrink-0">
                    {step.type === "tool-call" ? "▸" : "✓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-navy-800/80">
                      {toolLabel(step.tool)}
                    </span>
                    <span
                      className="block truncate text-xs text-navy-800/45"
                      title={step.summary}
                    >
                      {step.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Output</h2>
            {outputDoc && (
              <Link
                href={`/docs/${outputDoc.id}`}
                className="text-sm font-semibold text-mint-700 hover:underline"
              >
                Open document →
              </Link>
            )}
          </div>
          {outputDoc?.extracted_text ? (
            <>
              <div className="prose-calyflow max-h-130 overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {outputDoc.extracted_text}
                </ReactMarkdown>
              </div>
              <div className="mt-5 border-t border-navy-800/8 pt-4">
                <DownloadButtons
                  text={outputDoc.extracted_text}
                  filename={outputDoc.filename ?? "agent-output"}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-navy-800/45">
              This run didn&apos;t save a document.
            </p>
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
