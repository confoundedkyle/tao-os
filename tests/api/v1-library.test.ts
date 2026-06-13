import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAgent, LibraryWorkflow } from "@/lib/types";

const WORKFLOWS: LibraryWorkflow[] = [
  {
    id: "w1",
    slug: "submission-pack",
    name: "Candidate Submission Pack",
    description: "Combine a CV with its screening report.",
    category: "submission",
    prompt_template: "SECRET PROMPT {{workspace_kb}}",
    input_spec: { inputs: ["document"], required_doc_types: ["jd"], input_doc_types: ["cv"] },
    output_spec: { output: "document", name: "Submission pack" },
    version: 1,
    featured: true,
    og_description: "Use this free workflow to send a polished candidate pack.",
    lead: "Send the hiring manager a write-up that gets read.",
    long_description: "## What it does\nTurns a CV into a pack.",
  },
];

const AGENTS: LibraryAgent[] = [
  {
    id: "a1",
    slug: "candidate-outreach-email",
    name: "Candidate Outreach From Sheet via Email",
    description: "Reads a sheet and emails candidates.",
    instructions: "SECRET INSTRUCTIONS",
    allowed_tools: ["connector:data", "connector:email", "calyflow_create_document"],
    model: null,
    max_steps: 24,
    version: 1,
    featured: false,
    og_description: "Use this free agent to email candidates from a sheet.",
    lead: "Reach a whole list without the copy-paste.",
    long_description: "## What it does\nEmails candidates from your sheet.",
  },
];

vi.mock("@/lib/queries", () => ({
  listLibraryWorkflows: vi.fn(async () => WORKFLOWS),
  listLibraryAgents: vi.fn(async () => AGENTS),
}));

import { GET, OPTIONS, type PublicLibraryItem } from "@/app/api/v1/library/route";

async function body() {
  const res = await GET();
  return (await res.json()) as {
    workflows: PublicLibraryItem[];
    agents: PublicLibraryItem[];
  };
}

describe("GET /api/v1/library", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns workflows and agents shaped for marketing", async () => {
    const { workflows, agents } = await body();
    expect(workflows).toHaveLength(1);
    expect(agents).toHaveLength(1);

    const wf = workflows[0];
    expect(wf).toMatchObject({
      type: "workflow",
      slug: "submission-pack",
      name: "Candidate Submission Pack",
      category: "submission",
      featured: true,
      output: "Submission pack",
    });
    expect(wf.coverUrl).toContain("/api/v1/library/workflow/submission-pack/cover");
    expect(wf.ogDescription).toContain("free workflow");
    expect(wf.lead).toContain("hiring manager");
    expect(wf.longDescription?.startsWith("## ")).toBe(true);

    const agent = agents[0];
    expect(agent).toMatchObject({
      type: "agent",
      slug: "candidate-outreach-email",
      featured: false,
      category: null,
      output: "Emails",
    });
    expect(agent.connectors).toEqual(["Data", "Email"]);
    expect(agent.coverUrl).toContain(
      "/api/v1/library/agent/candidate-outreach-email/cover",
    );
  });

  it("never leaks prompt_template or instructions", async () => {
    const res = await GET();
    const raw = await res.text();
    expect(raw).not.toContain("SECRET PROMPT");
    expect(raw).not.toContain("SECRET INSTRUCTIONS");
  });

  it("sends public CORS and cache headers", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("answers preflight with 204", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
