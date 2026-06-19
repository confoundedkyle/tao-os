import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "What Calyflow agents are, how they run, and the ready-made agents you can use for sourcing, screening, scorecards, and outreach.",
};

const BODY = `
An **agent** is a small AI specialist for one recruiting task. It comes with its
own instructions, the set of tools it's allowed to use, and the documents it
needs — so you never write a prompt. You pick an agent, optionally type a one-line
task, and press **Run**.

## How an agent run works

When you run an agent it automatically reads:

- your **agency knowledge base** (your voice, standards, how you work),
- the **client's knowledge base** (that client's quirks and preferences),
- the **project's documents** (job description, intake notes, scorecard),
- and any **live data** from the connectors that agent uses.

It then does its work — searching, reading, reasoning — and **saves the result
back into the project** as a document you can open, edit, download, or send.

## Importing agents

Agents live in a shared **Library**. Importing one copies it into your workspace
so you can run (and tweak) it. New workspaces get a **starter pack** of the most
useful agents automatically, plus a fully-loaded **Demo project** to try them in.

## Ready-made agents

A selection of what ships today:

**Sourcing**
- **GitHub Sourcer** — find engineers through open source (repo contributors and
  forkers) with public contact details. *Needs the GitHub connector.*
- **Vincere Sourcer**, **Sourcing Shortlist from ATS / from Sheet**,
  **Coresignal Sourcing** — mine your ATS, a spreadsheet, or employment data.
- **Sourcing Strategy Map** — where to look for a given role.

**Screening & evaluation**
- **CV Screener** — rank CVs against the role.
- **Candidate Scorecard Rubric** — build an evaluation rubric.
- **Screening Call Prep** — a candidate summary and talking points before a call.

**Role definition**
- **Job Requirement Analysis** and **Intake-to-JD Builder** — turn a hiring
  manager's notes into a structured brief or job description.

**Outreach & marketing**
- **Outreach Writer** and **Candidate Outreach from Sheet via Email** — write and
  send personalised messages. *Email sending needs a mailbox connector.*
- **Job Selling Pitch**, **Candidate Marketing Profile**, **Submission Pack**.

**Reporting**
- **Reporting on Slack** — posts a short project status to your Slack channel on a
  schedule. See [Running agents from Slack](/docs/automation/slack).

> Some agents need a connector to do their job (e.g. GitHub Sourcer needs GitHub).
> If a required connector isn't connected, the run is blocked with a clear
> "Connect …" prompt until you set it up.

See also [What agents can do](/docs/capabilities) for the full list of actions,
grouped by tool.
`;

export default function AgentsDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How Calyflow is organized"
        title="Agents"
        lead="AI specialists for recruiting tasks — pick one, press Run, get a saved result."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
