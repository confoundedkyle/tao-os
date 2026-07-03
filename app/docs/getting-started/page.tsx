import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "Go from sign-up to your first agent run: clients, projects, documents, and agents — in plain language.",
};

const BODY = `
## The big idea

In TAO OS you run **agents** — small AI specialists for recruiting tasks like
sourcing, CV screening, building scorecards, and writing outreach. Each agent
runs against a **project** (a role you're filling for a **client**), reads the
context you've given it, and writes its result back into that project.

You don't write prompts. You set up your context once, then press **Run**.

## Your first run in 5 steps

1. **Create a free account.** New workspaces come with a ready-to-run **Demo
   project** in the sidebar — loaded with a sample job description, intake notes,
   a scorecard, and CVs. You can run any agent there immediately, with no setup,
   to see how it works.
2. **Create a client**, then a **project** inside it (one project per role).
3. **Add the role's documents** — a job description, intake notes, a scorecard.
   These become the agent's inputs. (See [Documents & project files](/docs/documents).)
4. **Pick an agent** from the project's Agents tab and press **Run**. The result
   is saved back into the project as a document.
5. **Connect your tools** when you want agents to reach live data — your ATS, CRM,
   spreadsheets, mailbox, or sourcing tools. (See [Connectors](/docs/connectors).)

## What makes runs smart

Every run automatically includes your **knowledge base** (your agency's voice and
each client's preferences) and the project's documents — so the agent already
knows the role and your standards before it starts. See
[Knowledge base](/docs/knowledge-base) and
[What agents can do](/docs/capabilities).

## A worked example

Say you're filling a **Senior Backend Engineer** role for a client:

1. Create the client **Northwind**, then a project **Senior Backend Engineer**.
2. Drop in the **job description** and the hiring manager's **intake notes**.
3. Run **Job Requirement Analysis** → you get a clean, structured brief.
4. Connect **GitHub**, then run **GitHub Sourcer** → a shortlist of engineers who
   contribute to the libraries in that stack, with contact details.
5. Run **Outreach Writer** → personalised first-touch messages, in your voice.

Every result is saved back into the project, ready to review, edit, or send.

## Run from anywhere

Once Slack is connected, your whole team can run agents from a channel with
\`/calyflow\` — and get automated project reports. See
[Running agents from Slack](/docs/automation/slack).
`;

export default function GettingStartedPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Start here"
        title="Getting started"
        lead="From sign-up to your first agent run — the whole picture in five steps."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
