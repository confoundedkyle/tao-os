import type { Metadata } from "next";
import { DocHeader, Markdown } from "@/components/docs/doc-blocks";

export const metadata: Metadata = {
  title: "Clients & projects",
  description:
    "How Calyflow organizes your work: clients are the companies you recruit for, projects are the roles you're filling.",
};

const BODY = `
Calyflow organizes everything around two simple ideas.

## Clients

A **client** is any team you recruit for — an external company, or, if you're an
in-house recruiter, an internal department like Engineering or Business Operations.
Each client can have its own **knowledge base** (how they like to work) and its own
**files** (decks, rate cards).

## Projects

A **project** is a single role you're filling for a client — "Senior Backend
Engineer", "VP Sales – Berlin". This is where the work happens: you add the role's
documents, run agents, and collect the results. **One project per role** keeps each
search's inputs and outputs together.

## How it fits together

\`\`\`
Workspace
  └─ Client (a company you recruit for)
       └─ Project (a role you're filling)
            ├─ Documents (job description, intake notes, scorecard, CVs…)
            ├─ Agents (run them here)
            └─ Results (saved back as documents)
\`\`\`

When an agent runs on a project, it automatically sees the workspace knowledge
base, the client's knowledge base, and the project's documents — so it has the
full context of the role without you repeating yourself.

Next: [Knowledge base](/docs/knowledge-base) ·
[Documents & project files](/docs/documents).
`;

export default function ProjectsDocPage() {
  return (
    <article>
      <DocHeader
        eyebrow="How Calyflow is organized"
        title="Clients & projects"
        lead="Clients are who you recruit for; projects are the roles you're filling."
      />
      <Markdown>{BODY}</Markdown>
    </article>
  );
}
