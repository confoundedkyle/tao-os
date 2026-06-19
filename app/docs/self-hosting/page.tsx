import Link from "next/link";
import type { Metadata } from "next";
import { listLiveConnectors } from "@/lib/docs/connectors";
import { getSelfHostSetup } from "@/lib/docs/self-hosting";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Self-hosting & OAuth apps",
  description:
    "Running your own Calyflow instance: which connectors need their own OAuth app, the redirect URLs, and the environment variables to set.",
};

const INTRO = `
Calyflow is open source, so you can run your own instance. Most of the difference
between the **hosted** version (app.calyflow.ai) and **self-hosting** is connector
setup:

- **API-key connectors** work identically — your users just paste a key in
  **Settings → Connectors**. Nothing to configure on the server.
- **OAuth connectors** (one-click "Connect" buttons) need **your own OAuth app**
  registered with each provider, because the hosted Calyflow OAuth apps belong to
  us. For each one you register an app, set its **redirect URL** to your
  deployment, and set a couple of **environment variables**.

Set the redirect URL to \`{APP_BASE_URL}/api/connectors/<provider>/callback\`,
where \`APP_BASE_URL\` is your instance's public URL.
`;

export default function SelfHostingPage() {
  const oauth = listLiveConnectors()
    .map((c) => ({ c, setup: getSelfHostSetup(c.provider!, c.auth) }))
    .filter((x) => x.setup !== null)
    .sort((a, b) => a.c.name.localeCompare(b.c.name));

  return (
    <article>
      <DocHeader
        eyebrow="Self-hosting"
        title="Self-hosting & OAuth apps"
        lead="What changes when you run your own Calyflow instance — and exactly what each OAuth connector needs."
      />
      <Markdown>{INTRO}</Markdown>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold text-navy-900">
        OAuth connectors at a glance
      </h2>
      <div className="overflow-x-auto rounded-card border border-navy-800/12">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-navy-800/[0.03] text-left text-navy-800/55">
              <th className="px-4 py-2 font-semibold">Connector</th>
              <th className="px-4 py-2 font-semibold">Redirect URL (after APP_BASE_URL)</th>
              <th className="px-4 py-2 font-semibold">Environment variables</th>
            </tr>
          </thead>
          <tbody>
            {oauth.map(({ c, setup }) => (
              <tr key={c.provider} className="border-t border-navy-800/8 align-top">
                <td className="px-4 py-2">
                  <Link
                    href={`/docs/connectors/${c.provider}`}
                    className="font-semibold text-mint-700 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-[12px] text-navy-800/70">
                  {setup!.redirectPath}
                </td>
                <td className="px-4 py-2 font-mono text-[12px] text-navy-800/70">
                  {setup!.envVars.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-navy-800/60">
        Each connector’s page has the full step-by-step (where to register the app
        and any regional settings). Every connector that isn’t listed here uses an
        API key — no server setup needed.
      </p>
    </article>
  );
}
