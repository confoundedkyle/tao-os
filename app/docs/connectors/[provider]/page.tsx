import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Chip } from "@/components/ui";
import { DocHeader, DocSection } from "@/components/docs/doc-blocks";
import {
  getConnectorDoc,
  listLiveConnectors,
} from "@/lib/docs/connectors";

export function generateStaticParams() {
  return listLiveConnectors().map((c) => ({ provider: c.provider! }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const doc = getConnectorDoc(provider);
  if (!doc) return { title: "Connector" };
  return {
    title: `${doc.connector.name} connector`,
    description: doc.connector.blurb,
  };
}

const AUTH_TONE = {
  "One-click OAuth": "mint",
  "Bring-your-own OAuth": "sky",
  "API key": "lavender",
} as const;

export default async function ConnectorPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  const doc = getConnectorDoc(provider);
  if (!doc) notFound();

  return (
    <article>
      <div className="mb-4 flex items-center gap-3">
        {doc.faviconUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon
          <img
            src={doc.faviconUrl}
            alt=""
            width={36}
            height={36}
            className="rounded-lg bg-white ring-1 ring-navy-800/10"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="navy">{doc.categoryLabel}</Chip>
          <Chip tone={AUTH_TONE[doc.authLabel]}>{doc.authLabel}</Chip>
        </div>
      </div>

      <DocHeader title={doc.connector.name} lead={doc.connector.blurb} />

      <DocSection title="What agents can do with it">
        <ul className="ml-5 list-disc space-y-1.5 text-navy-800/75">
          {doc.capabilities.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="What you'll need">
        <ul className="ml-5 list-disc space-y-1.5 text-navy-800/75">
          {doc.whatYouNeed.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="Connect it">
        <ol className="ml-5 list-decimal space-y-2 text-navy-800/75">
          {doc.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {doc.apiKeyPlaceholder && (
          <p className="mt-3 text-sm text-navy-800/60">
            Key format:{" "}
            <code className="rounded bg-navy-800/8 px-1.5 py-0.5 font-mono text-[13px]">
              {doc.apiKeyPlaceholder}
            </code>
          </p>
        )}
        {doc.links.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {doc.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-mint-700 hover:underline"
                >
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </DocSection>

      <DocSection title="Self-hosting">
        {doc.selfHost ? (
          <div className="space-y-3 text-navy-800/75">
            <p>
              Running your own Calyflow instance? Register your own OAuth app and
              point it back at your deployment:
            </p>
            <ol className="ml-5 list-decimal space-y-2">
              <li>
                Register an OAuth app
                {doc.selfHost.registerAt ? ` (${doc.selfHost.registerAt})` : ""}.
              </li>
              <li>
                Set the redirect / callback URL to{" "}
                <code className="rounded bg-navy-800/8 px-1.5 py-0.5 font-mono text-[13px]">
                  {`{APP_BASE_URL}${doc.selfHost.redirectPath}`}
                </code>
                .
              </li>
              <li>
                Set these environment variables on your deployment:
                <ul className="ml-5 mt-1 list-disc space-y-1">
                  {doc.selfHost.envVars.map((v) => (
                    <li key={v}>
                      <code className="rounded bg-navy-800/8 px-1.5 py-0.5 font-mono text-[13px]">
                        {v}
                      </code>
                    </li>
                  ))}
                </ul>
              </li>
            </ol>
            {doc.selfHost.notes?.map((n) => (
              <p key={n} className="text-sm text-navy-800/60">
                {n}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-navy-800/75">
            Nothing extra for self-hosting — this connector uses an API key, so
            you connect it exactly the same way as on the hosted version: paste
            your key in Settings → Connectors.
          </p>
        )}
      </DocSection>
    </article>
  );
}
