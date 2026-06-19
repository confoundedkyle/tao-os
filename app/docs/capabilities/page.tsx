import Link from "next/link";
import type { Metadata } from "next";
import {
  CONNECTOR_DOMAINS,
  connectorFaviconUrl,
  type ConnectorCategory,
} from "@/lib/connectors";
import { getConnectorDoc, listLiveConnectors } from "@/lib/docs/connectors";
import { DocHeader } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "What agents can do",
  description:
    "The actions Calyflow agents can take, in plain language, grouped by the tool they use.",
};

const GROUP_ORDER: { category: ConnectorCategory; label: string }[] = [
  { category: "ats", label: "ATS" },
  { category: "crm", label: "CRM" },
  { category: "data", label: "Data & spreadsheets" },
  { category: "email", label: "Email" },
  { category: "comms", label: "Slack" },
  { category: "tool", label: "Sourcing & enrichment" },
];

export default function CapabilitiesPage() {
  const live = listLiveConnectors();
  return (
    <article>
      <DocHeader
        eyebrow="Capabilities"
        title="What agents can do"
        lead="Agents act through your connected tools. Here's what each unlocks, in plain language — no setup details, just the actions. Connect a tool to give your agents that ability."
      />

      <section className="mt-8 rounded-card border border-navy-800/12 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Built in — no connector needed
        </h2>
        <ul className="ml-5 mt-2 list-disc space-y-1.5 text-navy-800/75">
          <li>Search your knowledge base and project documents</li>
          <li>Read a full document by name</li>
          <li>Write a result back into the project as a new document</li>
        </ul>
      </section>

      {GROUP_ORDER.map(({ category, label }) => {
        const items = live
          .filter((c) => c.category === category)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!items.length) return null;
        return (
          <section key={category} className="mt-10">
            <h2 className="mb-4 font-display text-xl font-semibold text-navy-900">
              {label}
            </h2>
            <div className="space-y-4">
              {items.map((c) => {
                const doc = getConnectorDoc(c.provider!);
                if (!doc) return null;
                const favicon = connectorFaviconUrl(
                  CONNECTOR_DOMAINS[c.provider!],
                );
                return (
                  <div
                    key={c.provider}
                    className="rounded-card border border-navy-800/12 bg-white p-4"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      {favicon && (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon
                        <img
                          src={favicon}
                          alt=""
                          width={20}
                          height={20}
                          className="rounded bg-white ring-1 ring-navy-800/10"
                        />
                      )}
                      <Link
                        href={`/docs/connectors/${c.provider}`}
                        className="font-semibold text-navy-900 hover:text-mint-700"
                      >
                        {c.name}
                      </Link>
                    </div>
                    <ul className="ml-5 list-disc space-y-1 text-sm text-navy-800/70">
                      {doc.capabilities.map((cap) => (
                        <li key={cap}>{cap}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </article>
  );
}
