import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Running agents from Slack",
  description:
    "Connect Slack, point a channel at a project, and run recruiting agents with /calyflow or @Calyflow — plus automated project reports.",
};

const BODY = `
Connect Slack once and your whole team can run recruiting agents by typing a
message — and get automated project reports in the channel.

## One-time setup

1. **Connect Slack.** In TAO OS go to **Settings → Connectors → Slack** and
   click **Connect**, then approve the app in Slack.
2. **Point a channel at a project.** Open a project's **Settings → Slack** and
   either pick an existing channel or click **Create a dedicated channel**. We
   recommend one channel per role.

## Run an agent — two ways

Every agent has a short **handle** (e.g. \`github-sourcer\`, \`cv-screener\`,
\`outreach-writer\`). Give the handle plus, optionally, a plain-English task.

**Slash command** — type in the project's channel:

\`\`\`
/calyflow github-sourcer find 5 senior video-encoding engineers in the EU
\`\`\`

TAO OS acks instantly, runs in the background, and posts the result to the
channel when it's done.

**@mention** — works the same, and replies in a thread:

\`\`\`
@Calyflow cv-screener rank the attached CVs against the JD
\`\`\`

## Not sure what to run?

Send \`/calyflow\` on its own (or \`help\`) and the bot lists every agent available
in your workspace, with a usage example.

## Automated project reports

In a project's **Settings → Slack**, set **Automated report** to **Daily** or
**Weekly**. The *Reporting on Slack* agent then posts a short,
hiring-manager-friendly status to that channel on a schedule — what moved, what's
blocked, and what needs a decision. (Reports go out in the morning, UTC; weekly
reports on Mondays.)

## Good to know

- Runs use **your own AI and your own connected tools**, exactly like in the app.
- Results are posted into the channel, with a link to open the full result in
  TAO OS.
- If an agent needs a connector that isn't connected (e.g. GitHub Sourcer needs
  GitHub), TAO OS tells you which one to connect.

## Troubleshooting

- **"This channel isn't linked to a TAO OS project yet."** Open the project's
  **Settings** tab and pick or create a channel.
- **"Connect GitHub" (or another tool).** The agent needs a connector that isn't
  set up — connect it under [Connectors](/docs/connectors) and re-run.

> **Self-hosting?** The Slack connector needs your own Slack app: set
> \`SLACK_CLIENT_ID\`, \`SLACK_CLIENT_SECRET\`, and \`SLACK_SIGNING_SECRET\`, and
> register the redirect, slash-command, and events URLs. See
> [Self-hosting & OAuth apps](/docs/self-hosting) and the
> [Slack connector page](/docs/connectors/slack).
`;

export default function SlackAutomationPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Automation"
        title="Running agents from Slack"
        lead="Recruit from the channel your team already lives in — on-demand runs plus automatic reports."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
