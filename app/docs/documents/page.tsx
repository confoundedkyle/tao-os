import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Documents & project files",
  description:
    "How documents work in TAO OS: project files feed your agents, client files are for context, and agents save their results back as documents.",
};

const BODY = `
Documents are the files agents read from and write to. Where a document lives
decides how it's used.

## Project files

Files attached to a **project** — the role's **job description**, **intake notes**,
and **scorecard**, plus any supporting docs. These are an agent's main inputs:
when you run an agent, the project's **active** files are included automatically.

- Each "slot" (JD, intake notes, scorecard) keeps **one active file** — uploading
  a new job description archives the old one.
- Find them on a project's **Documents** tab.

## A note on CVs

CVs are handled specially. They are **not** auto-injected into every run — you
**pick the CV(s)** for a screening run, or attach them just for that run. This
keeps one candidate's screening from leaking into another's.

## Client files

Files attached to a **client** — sales collateral like a company deck, benefits
overview, or rate card. These are **for your reference and outreach context and
are not sent to the AI**. Use the client knowledge base for things you *do* want
agents to read.

## Agent-created results (outputs)

When an agent finishes, it **saves its result back into the project** as an
**output** document — a screening report, a shortlist, an outreach draft. You can
open, edit, rename, download (Markdown, PDF, or Word), or delete it. Outputs show
up under "Agent-created documents" on the project's Documents tab.

## Supported file types

PDF, Word (.docx), plain text, and Markdown, up to 20 MB each. Text is extracted
so agents can read the contents; Markdown and pasted notes can also be edited
in place.

See also [Knowledge base](/docs/knowledge-base) for context that applies across
every run.
`;

export default function DocumentsDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How TAO OS is organized"
        title="Documents & project files"
        lead="Project files feed your agents; client files are for context; results are saved back as documents."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
