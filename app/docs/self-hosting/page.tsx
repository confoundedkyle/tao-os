import Link from "next/link";
import type { Metadata } from "next";
import { listLiveConnectors } from "@/lib/docs/connectors";
import { getSelfHostSetup } from "@/lib/docs/self-hosting";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Self-hosting & OAuth apps",
  description:
    "Running your own TAO OS instance: which connectors need their own OAuth app, the redirect URLs, and the environment variables to set.",
};

const INTRO = `
TAO OS is open source and built to be self-hosted — every instance is your
own. Getting connectors working is most of the setup:

- **API-key connectors** work out of the box — users paste a key in
  **Settings → Connectors**. Nothing to configure on the server.
- **OAuth connectors** (one-click "Connect" buttons) need **your own OAuth app**
  registered with each provider — there is no shared TAO OS OAuth app, so each
  instance registers its own. For each one, create the app with the provider,
  set its **redirect URL** to your deployment, and set a couple of
  **environment variables**.

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
        lead="Every TAO OS instance is self-hosted — here's exactly what each OAuth connector needs."
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
