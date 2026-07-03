import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Knowledge base",
  description:
    "Teach TAO OS your agency's voice and each client's preferences — automatically used by every agent run.",
};

const BODY = `
Your **knowledge base** is the context agents use on every run. It's how TAO OS
sounds like *you* and knows how each client likes to work — without you repeating
yourself each time.

There are two levels:

## Workspace knowledge base

Your agency's playbook: your **tone of voice**, screening philosophy, the markets
you serve, and team preferences. It applies to **everything** you run.

Find it under **Knowledge Base** in the main menu.

## Client knowledge base

Context for one specific client: their hiring quirks, must-haves and red flags,
culture, and how they like candidates presented. It applies to every project (and
every run) for that client.

Find it on a client's page under **Knowledge base**.

## What to put in each

**Workspace knowledge base — examples**

- Your tone of voice ("warm, concise, no buzzwords; always offer a clear next step").
- Your screening philosophy and red flags.
- Boilerplate you reuse: outreach openers, your agency's pitch, how you present
  candidates.
- The markets, seniority, and functions you specialise in.

**Client knowledge base — examples**

- Must-haves and deal-breakers for that client ("must have led a team of 5+",
  "no agency-hoppers").
- How they like candidates presented, and their interview process.
- Culture and selling points to use in outreach.
- Comp ranges, locations, and visa/relocation stance.

## How agents use it

Before an agent runs, TAO OS assembles a **"Project context"** block — your
workspace knowledge base, then the client's knowledge base, then the project's
documents — and gives it to the agent. Your personal sender details (Settings →
Personal) sit on top and take priority if anything conflicts. The upshot: agents
read your knowledge directly and only go looking elsewhere for what isn't already
there.

## Getting started, and how to add more

A new workspace starts empty. Open the **Knowledge base** tab and hit **Start
creating**: a guided assistant asks you a few quick questions — about your company,
how you recruit, your tone of voice, sourcing, and outreach — and turns your answers
into knowledge documents as you go. You don't have to finish in one sitting; it
saves after each area and picks up where you left off next time, deepening the
documents as you add more.

You can also add knowledge directly, any time:

- **Write a note** directly in the editor.
- **Upload a file** — PDF, Word (.docx), text, or Markdown (up to 20 MB).
- **Import from a website** — paste a domain and TAO OS drafts a knowledge note
  from it (available when web import is enabled on your instance).

> Knowledge base content is **context**, not a candidate database. For candidate,
> account, and prospect records, see [Modules](/docs/modules). For the role's
> input files, see [Documents & project files](/docs/documents).
`;

export default function KnowledgeBaseDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How TAO OS is organized"
        title="Knowledge base"
        lead="The context every agent reads — your agency's voice and each client's preferences."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
