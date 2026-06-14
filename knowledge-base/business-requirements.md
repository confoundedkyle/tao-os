# Business requirements

## Vision
Calyflow is an **open-source recruiting OS** (AGPL-3.0, self-hostable). It gives
recruiters a library of AI **agents** that do real recruiting work — screening
CVs, building requirement breakdowns, sourcing, outreach, submissions — grounded
in the recruiter's own documents and data, with the output saved back into the
project. Contact: hello@calyflow.ai.

## Goals
- **Cut busywork.** Turn hours of manual screening/writing into minutes.
- **Evidence-based, not hand-wavy.** Outputs quote the source (CV, JD) and flag
  gaps; agents never invent facts.
- **Bring your own.** Your documents, your connected tools, your AI keys. A
  one-time included credit lets people start free; BYO keys are never capped.
- **Transparent.** Every run shows how it works (a canvas), what the agent did
  (tool steps), the output document, and the cost.
- **Yours to tweak.** Imported agents are your copies — rename them, edit the
  prompt, keep what works.

## Who it's for
Recruiters and recruiting agencies — both **delivery** (filling a client's role)
and **business development** (winning new clients/candidates to market).

## Core concepts (in business terms)
- **Client → Project.** A project is a role you're filling for a client.
- **Agent.** A pre-built, editable AI worker with a defined skill. Lives in the
  **library**; you import the ones you want.
- **Context.** An agent belongs to a **Recruiting Project** (runs inside a
  project) or **Business Development** (prospecting/marketing, not tied to a role).
- **Documents.** What an agent reads (job description, intake notes, scorecard,
  CVs) and what it writes (saved back to the project). Workspace/client knowledge
  bases give every run shared background automatically.
- **Connectors.** Optional links to your ATS / CRM / spreadsheets / email so
  agents can pull and push real data.
- **Run.** One execution of an agent, with status, cost, and a saved result.

## User stories
- As a recruiter, I **browse the library and import** an agent so I have the
  skills I need.
- As a recruiter, I **set up a project's documents once** (JD, intake notes) and
  reuse them on every run.
- As a recruiter, I **pick an agent and run it on a project** and get an
  evidence-based document back, saved to the project.
- As a recruiter, the app **tells me what's missing** (e.g. "add a Job
  Description") and won't let me run until it's ready; I can **upload the missing
  doc right there**.
- As a recruiter, I **review, edit, rename, and download** an agent's output
  (Markdown / PDF / DOCX).
- As a recruiter, I **see how an agent works** (its inputs, tools, output) and
  **what it actually did** before trusting the result.
- As a recruiter, I **reorder my agents** so the ones I use most are on top.
- As a recruiter, I **connect my ATS/CRM/sheets/email** so sourcing and outreach
  agents work on my real data.
- As an agency owner, I **keep business-development agents separate** from
  client-delivery work.
- As a workspace admin, I **track AI usage and cost** and set a monthly limit.
- As an evaluator, I **try the live demo** (real CV Screener) before signing up.

## Expectations / principles
- Recruiting-project agents appear inside a project; other contexts are surfaced
  in their own place — the project workspace stays focused.
- Required inputs gate a run and are surfaced clearly; readiness is visible at a
  glance.
- Outputs are first-class documents the recruiter owns and can refine.
- Nothing private (prompts, customer data) leaks through the public marketing API.
- The product should look modern and polished — screenshots are used for
  marketing.

## Non-goals (for now)
- A dedicated run surface for business-development agents (they're importable and
  categorized, but project-tab running is the primary flow today).
- Auto-upgrading imported agent copies when the library changes (upgrade is
  opt-in, per copy).
