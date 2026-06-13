import { describe, expect, it } from "vitest";
import {
  deriveLibraryAgentGraph,
  deriveWorkflowGraph,
} from "@/lib/workflow-graph";
import { renderGraphCoverSvg } from "@/lib/cover-svg";

const WORKFLOW = deriveWorkflowGraph({
  name: "Candidate Submission Pack",
  promptTemplate:
    "{{workspace_kb}} {{client_kb}} {{client_files}} {{project_files}} {{input_documents}}",
  inputSpec: {
    inputs: ["document"],
    required_doc_types: ["jd"],
    input_doc_types: ["cv", "output"],
    knowledge: ["workspace", "client"],
  },
  outputSpec: { output: "document", name: "Submission pack" },
});

const AGENT = deriveLibraryAgentGraph({
  name: "Candidate Outreach From Sheet via Email",
  allowedTools: [
    "calyflow_search_documents",
    "connector:data",
    "connector:email",
    "calyflow_create_document",
  ],
});

describe("renderGraphCoverSvg", () => {
  it("emits a well-formed 16:9 SVG", () => {
    const svg = renderGraphCoverSvg(WORKFLOW);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
    // No unresolved template placeholders from the icon markup.
    expect(svg).not.toContain("{F}");
    expect(svg).not.toContain("{S}");
  });

  it("renders the workflow name, engine, and output", () => {
    const svg = renderGraphCoverSvg(WORKFLOW);
    // The skill title wraps across lines, so assert its words, not the whole string.
    expect(svg).toContain("Candidate Submission");
    expect(svg).toContain("AI Engine");
    expect(svg).toContain("Submission pack");
    expect(svg).toContain("Job description"); // required-doc node
    expect(svg).toContain("REQUIRED"); // badge pill
  });

  it("renders agent covers generically (catalog variant)", () => {
    const svg = renderGraphCoverSvg(AGENT);
    expect(svg).toContain("Any Data");
    expect(svg).toContain("AGENT");
    expect(svg).toContain("Emails"); // email connector → output
    expect(svg).not.toContain("Missing");
    expect(svg).not.toContain("No Data connected");
  });

  it("escapes special characters in titles", () => {
    const graph = deriveWorkflowGraph({
      name: "Tom & Jerry <Recruiter>",
      promptTemplate: "{{workspace_kb}}",
      inputSpec: null,
      outputSpec: { output: "document", name: "Doc" },
    });
    const svg = renderGraphCoverSvg(graph);
    expect(svg).toContain("Tom &amp; Jerry &lt;Recruiter&gt;");
  });
});

describe("deriveLibraryAgentGraph (catalog variant)", () => {
  it("renders unselected connectors as 'Any <Category>' without a Missing badge", () => {
    const ats = AGENT.nodes.find((n) => n.id === "itm-conn-data")!;
    expect(ats.title).toBe("Any Data");
    expect(ats.badge).toBeUndefined();
    // Email is the destination, not an input item.
    expect(AGENT.nodes.some((n) => n.id === "itm-conn-email")).toBe(false);
    const out = AGENT.nodes.find((n) => n.id === "out")!;
    expect(out.title).toBe("Emails");
    expect(out.badge).toBeUndefined();
  });
});
