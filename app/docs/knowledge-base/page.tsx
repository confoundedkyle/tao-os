import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Knowledge base",
  description:
    "Teach Calyflow your agency's voice and each client's preferences — automatically used by every agent run.",
};

const BODY = `
Your **knowledge base** is the context agents use on every run. It's how Calyflow
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

## How agents use it

Before an agent runs, Calyflow assembles a **"Project context"** block — your
workspace knowledge base, then the client's knowledge base, then the project's
documents — and gives it to the agent. Your personal sender details (Settings →
Personal) sit on top and take priority if anything conflicts. The upshot: agents
read your knowledge directly and only go looking elsewhere for what isn't already
there.

## What you start with, and how to add more

Every new workspace is **seeded with starter knowledge** — company, tone of voice,
recruiting best practices, sourcing notes, and message templates — so agents are
useful on day one. Edit those to match your agency.

You can add knowledge three ways:

- **Write a note** directly in the editor.
- **Upload a file** — PDF, Word (.docx), text, or Markdown (up to 20 MB).
- **Import from a website** — paste a domain and Calyflow drafts a knowledge note
  from it (available when web import is enabled on your instance).

> Knowledge base content is **context**, not a candidate database. For candidate,
> account, and prospect records, see [Modules](/docs/modules). For the role's
> input files, see [Documents & project files](/docs/documents).
`;

export default function KnowledgeBaseDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How Calyflow is organized"
        title="Knowledge base"
        lead="The context every agent reads — your agency's voice and each client's preferences."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
