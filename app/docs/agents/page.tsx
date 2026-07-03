import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "What TAO OS agents are, how they run, and the ready-made agents you can use for sourcing, screening, scorecards, and outreach.",
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

## Choosing an agent

- **Defining the role?** Start with *Job Requirement Analysis* or *Intake-to-JD
  Builder* to turn messy notes into a clear brief.
- **Finding people?** Use a sourcing agent that matches where your candidates are
  — *GitHub Sourcer* for engineers, *Sourcing Shortlist from ATS* for your own
  database, *Coresignal Sourcing* for the open market.
- **Deciding who's best?** *CV Screener* and *Candidate Scorecard Rubric*.
- **Reaching out?** *Outreach Writer* (drafts) or *Candidate Outreach from Sheet
  via Email* (drafts **and** sends).

## Example tasks you can type

You can run an agent with no task at all (it does its standard job), or add a
one-line steer:

- \`Find 8 backend engineers with payments experience, EU-based\`
- \`Screen the attached CVs and flag anyone missing Kubernetes in production\`
- \`Draft a warm first message to the top 3, signed off as me\`
- \`Build a scorecard for this role and weight Kubernetes highest\`

## A typical end-to-end run

1. *Job Requirement Analysis* turns the hiring manager's notes into a clear brief.
2. *Candidate Scorecard Rubric* builds the evaluation criteria.
3. A sourcing agent assembles a shortlist from your ATS or the open web.
4. *CV Screener* ranks the shortlist against the brief.
5. *Outreach Writer* drafts personalised first-touch messages.

Each step saves its result back into the project, so the next agent builds on it.

See also [What agents can do](/docs/capabilities) for the full list of actions,
grouped by tool.
`;

export default function AgentsDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How TAO OS is organized"
        title="Agents"
        lead="AI specialists for recruiting tasks — pick one, press Run, get a saved result."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
