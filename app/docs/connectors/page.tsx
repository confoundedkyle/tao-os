import Link from "next/link";
import type { Metadata } from "next";
import {
  CONNECTORS,
  CONNECTOR_DOMAINS,
  connectorFaviconUrl,
  type ConnectorCategory,
} from "@/lib/connectors";
import { DocHeader } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Connectors",
  description:
    "Every tool Calyflow connects to — your ATS, CRM, spreadsheets, email, Slack, and sourcing & enrichment tools.",
};

const GROUPS: { category: ConnectorCategory; label: string; blurb: string }[] = [
  { category: "ats", label: "ATS", blurb: "Sync jobs and candidates from your applicant tracking system." },
  { category: "crm", label: "CRM", blurb: "Pull accounts, contacts, and deals from your CRM." },
  { category: "data", label: "Data & spreadsheets", blurb: "Read candidate and client trackers from your spreadsheets." },
  { category: "email", label: "Email", blurb: "Send outreach from your own mailbox." },
  { category: "comms", label: "Slack", blurb: "Run agents and get reports in your team's Slack." },
  { category: "tool", label: "Sourcing & enrichment", blurb: "Find and enrich candidates and contacts." },
];

function authBadge(auth?: "oauth" | "apikey", byo?: boolean) {
  if (auth === "oauth") return byo ? "Bring-your-own OAuth" : "One-click OAuth";
  return "API key";
}

export default function ConnectorsOverviewPage() {
  const live = CONNECTORS.filter((c) => c.live && c.provider);
  return (
    <article>
      <DocHeader
        eyebrow="Connectors"
        title="Connect your stack"
        lead="Bring your ATS, CRM, spreadsheets, mailbox, and sourcing tools into Calyflow so your agents can read from — and write to — the systems you already use. Pick one to see exactly what it does and how to set it up."
      />

      {GROUPS.map(({ category, label, blurb }) => {
        const items = live
          .filter((c) => c.category === category)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!items.length) return null;
        return (
          <section key={category} className="mt-10">
            <h2 className="font-display text-xl font-semibold text-navy-900">
              {label}
            </h2>
            <p className="mb-4 text-sm text-navy-800/55">{blurb}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((c) => {
                const favicon = connectorFaviconUrl(
                  CONNECTOR_DOMAINS[c.provider!],
                );
                return (
                  <Link
                    key={c.provider}
                    href={`/docs/connectors/${c.provider}`}
                    className="group flex items-start gap-3 rounded-card border border-navy-800/12 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    {favicon && (
                      // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon
                      <img
                        src={favicon}
                        alt=""
                        width={28}
                        height={28}
                        className="mt-0.5 rounded-md bg-white ring-1 ring-navy-800/10"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-navy-900 group-hover:text-mint-700">
                          {c.name}
                        </h3>
                        <span className="rounded-chip bg-navy-800/6 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-800/45">
                          {authBadge(c.auth, c.byoOAuth)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-navy-800/60">{c.blurb}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </article>
  );
}
