// The knowledge-base areas the onboarding assistant works through. Kept in its
// own client-safe module (no server-only deps) so both the server prompt
// (guidelines.ts) and the browser panel (progress checklist) can import it
// without bundling the full system prompt into the client.

/**
 * One area maps to a single canonical workspace KB document (one file per area,
 * enriched over time). `onboarding_save_kb_doc` writes to these exact filenames
 * so re-visiting an area updates its document rather than creating duplicates.
 */
export interface KbArea {
  /** Canonical KB filename (also the upsert key). */
  filename: string;
  /** Short human label used in progress copy. */
  label: string;
  /** What this area is for and the concrete things to draw out of the user. */
  guidance: string;
}

export const KB_AREAS: KbArea[] = [
  {
    filename: "company.md",
    label: "Company overview",
    guidance:
      "Who they are. Company/agency name and website, what they do in a " +
      "sentence, mission and (if they have one) vision, a few core values, " +
      "stage and size (founded, headcount, funding), location and remote " +
      "policy, the industry/market they play in, and — if a product company — " +
      "what they build and their tech stack. For an agency, the kinds of roles " +
      "and clients they recruit for.",
  },
  {
    filename: "tone-of-voice.md",
    label: "Tone of voice",
    guidance:
      "How candidate-facing writing should sound (outreach, follow-ups, " +
      "rejections). Capture a handful of voice principles and a short " +
      "'we are X, not Y' table (e.g. warm not stiff, concise not verbose). " +
      "This shapes every message an agent writes, so make it concrete.",
  },
  {
    filename: "recruiting.md",
    label: "Recruiting process & philosophy",
    guidance:
      "How they like to recruit: their interview process/stages, what good " +
      "candidate experience looks like to them, scorecards, how fast they move " +
      "on offers, and any hard don'ts (compliance lines, things they never ask " +
      "or promise). Their dos and don'ts.",
  },
  {
    filename: "sourcing.md",
    label: "Sourcing strategy",
    guidance:
      "Where they find candidates: preferred channels by role type " +
      "(LinkedIn, GitHub, communities, referrals, job boards), how their " +
      "referral programme works, how they treat passive vs active candidates, " +
      "and any sourcing tactics or boolean tips that work for them.",
  },
  {
    filename: "team.md",
    label: "Team & hiring managers",
    guidance:
      "The shape of the org and who owns hiring: main functions/departments, " +
      "rough team sizes, this quarter's hiring priorities, and the hiring " +
      "managers — who owns which roles and what each cares about. Only relevant " +
      "for in-house/corporate teams; for an agency, focus on their clients and " +
      "key contacts instead, and skip if it doesn't apply.",
  },
  {
    filename: "outreach-messages.md",
    label: "Outreach style & channels",
    guidance:
      "How they reach out: which channels (LinkedIn vs email), the length and " +
      "structure they expect for each (e.g. 2–3 sentence LinkedIn notes vs " +
      "full emails with subject + signature), and the one-paragraph 'context " +
      "block' an agent should assume about the company when writing messages.",
  },
  {
    filename: "templates.md",
    label: "Message templates",
    guidance:
      "Any reusable message templates they want on hand: cold outreach, " +
      "application acknowledgement, interview invitation, rejection, offer. " +
      "If they already have wording they like, capture it verbatim; otherwise " +
      "offer to draft starting points in their tone of voice. Optional — only " +
      "if useful to them.",
  },
];
