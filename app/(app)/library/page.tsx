import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listLibraryWorkflows, listWorkspaceWorkflows } from "@/lib/queries";
import { importWorkflowAction } from "@/lib/actions/workflows";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import {
  IconAiSpark,
  IconDocumentCheck,
  IconEnvelope,
  IconMagnet,
  IconRocket,
  IconScorecard,
} from "@/components/icons";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  intake: IconDocumentCheck,
  icp: IconScorecard,
  sourcing: IconMagnet,
  selling: IconAiSpark,
  outreach: IconEnvelope,
  screening: IconScorecard,
  submission: IconRocket,
};

const CATEGORIES = [
  "intake",
  "icp",
  "sourcing",
  "selling",
  "outreach",
  "screening",
  "submission",
] as const;

const AUTHOR = "Michal Juhas";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { category } = await searchParams;
  const active = (CATEGORIES as readonly string[]).includes(category ?? "")
    ? category
    : undefined;
  const [library, imported] = await Promise.all([
    listLibraryWorkflows(),
    listWorkspaceWorkflows(session.workspaceId),
  ]);
  const importedIds = new Set(
    imported.map((w) => w.library_workflow_id).filter(Boolean),
  );
  const shown = active
    ? library.filter((wf) => wf.category === active)
    : library;

  return (
    <>
      <PageHeader
        title="Workflow library"
        description="Curated recruiting workflows. Import the ones you want — your copy is yours to rename and tweak."
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = cat === active;
          return (
            <Link
              key={cat}
              // Clicking the active badge again clears the filter.
              href={isActive ? "/library" : `/library?category=${cat}`}
              className={`rounded-chip px-2.5 py-0.5 text-[13px] font-semibold transition ${
                isActive
                  ? "bg-mint-400/22 text-mint-700"
                  : "bg-navy-800/8 text-navy-800/70 hover:bg-navy-800/15"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {shown.map((wf) => {
          const Icon = CATEGORY_ICONS[wf.category] ?? IconDocumentCheck;
          const isImported = importedIds.has(wf.id);
          return (
            <Card key={wf.id} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <Icon size={32} className="text-navy-800" />
                <Chip tone="navy">{wf.category}</Chip>
              </div>
              <h3 className="text-xl font-semibold">{wf.name}</h3>
              <p className="mb-4 mt-1 flex-1 text-[15px] text-navy-800/55">
                {wf.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-navy-800/45">
                  <span className="font-mono">v{wf.version}</span> · by {AUTHOR}
                </span>
                {isImported ? (
                  <Chip tone="mint">✓ Imported</Chip>
                ) : (
                  <form action={importWorkflowAction.bind(null, wf.id)}>
                    <Button variant="small" type="submit">
                      Import
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
        {library.length === 0 ? (
          <p className="text-navy-800/55">
            The library is empty — run the seed script (
            <span className="font-mono text-[13px]">npx tsx scripts/seed.ts</span>
            ) to load the launch workflows.
          </p>
        ) : (
          shown.length === 0 && (
            <p className="text-navy-800/55">
              No workflows in this category yet.
            </p>
          )
        )}
      </div>
    </>
  );
}
