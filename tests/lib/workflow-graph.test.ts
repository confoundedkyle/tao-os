import { describe, expect, it } from "vitest";
import type { InputSpec, OutputSpec } from "@/lib/types";
import { deriveWorkflowGraph } from "@/lib/workflow-graph";

// Mirrors workflows/submission-pack.yaml.
const SUBMISSION_PACK = {
  name: "Candidate Submission Pack",
  promptTemplate: [
    "<workspace_context>{{workspace_kb}}</workspace_context>",
    "<client_context>{{client_kb}} {{client_files}}</client_context>",
    "<project_context>{{project_files}}</project_context>",
    "<candidate_documents>{{input_documents}}</candidate_documents>",
  ].join("\n"),
  inputSpec: {
    inputs: ["document"],
    required_doc_types: ["jd"],
    input_doc_types: ["cv", "output"],
    knowledge: ["workspace", "client"],
  } satisfies InputSpec,
  outputSpec: { output: "document", name: "Submission pack" } satisfies OutputSpec,
};

describe("deriveWorkflowGraph", () => {
  it("derives the grouped submission-pack shape", () => {
    const graph = deriveWorkflowGraph(SUBMISSION_PACK);

    expect(graph.nodes.map((n) => n.id)).toEqual([
      "grp-knowledge",
      "itm-workspace",
      "itm-client",
      "grp-project",
      "itm-jd",
      "itm-cv",
      "itm-output",
      "skill",
      "step",
      "out",
    ]);
    expect(graph.edges).toEqual([
      { id: "e-grp-knowledge", source: "grp-knowledge", target: "step", kind: "knowledge" },
      { id: "e-grp-project", source: "grp-project", target: "step", kind: "project" },
      { id: "e-skill", source: "skill", target: "step", kind: "skill" },
      { id: "e-out", source: "step", target: "out", kind: "output" },
    ]);

    const jd = graph.nodes.find((n) => n.id === "itm-jd")!;
    expect(jd).toMatchObject({
      kind: "item",
      title: "Job description",
      badge: "Required",
      parentId: "grp-project",
    });
    const cv = graph.nodes.find((n) => n.id === "itm-cv")!;
    expect(cv.badge).toBeUndefined();
    expect(cv.subtitle).toBe("You pick at run time");

    // The skill carries the workflow name; the engine is just the engine.
    expect(graph.nodes.find((n) => n.id === "skill")!.title).toBe(
      "Candidate Submission Pack",
    );
    expect(graph.nodes.find((n) => n.id === "step")!.title).toBe("AI Engine");
  });

  it("lays the columns out left to right, vertically centered", () => {
    const a = deriveWorkflowGraph(SUBMISSION_PACK);
    expect(a).toEqual(deriveWorkflowGraph(SUBMISSION_PACK)); // deterministic

    const knowledge = a.nodes.find((n) => n.id === "grp-knowledge")!;
    const project = a.nodes.find((n) => n.id === "grp-project")!;
    const skill = a.nodes.find((n) => n.id === "skill")!;
    const step = a.nodes.find((n) => n.id === "step")!;
    const out = a.nodes.find((n) => n.id === "out")!;
    expect(knowledge.position.x).toBeLessThan(project.position.x);
    expect(project.position.x).toBeLessThan(step.position.x);
    expect(step.position.x).toBeLessThan(out.position.x);
    // The skill sits directly above the engine in the same column.
    expect(skill.position.x).toBe(step.position.x);
    expect(skill.position.y).toBeLessThan(step.position.y);

    // Bounds are normalized to start at (0, 0) and stay within width/height.
    for (const node of a.nodes.filter((n) => !n.parentId)) {
      expect(node.position.y, node.id).toBeGreaterThanOrEqual(0);
      expect(node.position.x, node.id).toBeGreaterThanOrEqual(0);
      expect(node.position.x, node.id).toBeLessThan(a.width);
      expect(node.position.y, node.id).toBeLessThan(a.height);
    }
    // The project group (3 items) is taller than knowledge (2), so it starts
    // higher; both center on the flow midline.
    expect(project.position.y).toBeLessThan(knowledge.position.y);

    // Items are positioned relative to their group, inside its box.
    const items = a.nodes.filter((n) => n.kind === "item");
    for (const item of items) {
      expect(item.parentId).toBeTruthy();
      const parent = a.nodes.find((n) => n.id === item.parentId)!;
      expect(item.position.y + item.size!.height).toBeLessThanOrEqual(
        parent.size!.height,
      );
    }
  });

  it("reads knowledge sources from the spec", () => {
    const workspaceOnly = deriveWorkflowGraph({
      name: "Marketing Profile",
      promptTemplate: "{{workspace_kb}} {{input_document}}",
      inputSpec: { inputs: ["document"], input_doc_types: ["cv"], knowledge: ["workspace"] },
    });
    const ids = workspaceOnly.nodes.map((n) => n.id);
    expect(ids).toContain("itm-workspace");
    expect(ids).not.toContain("itm-client");
  });

  it("falls back to template placeholders for custom workflows without a spec", () => {
    const graph = deriveWorkflowGraph({
      name: "Custom",
      promptTemplate: "{{workspace_kb}} {{client_kb}} {{project_files}} {{input_documents}}",
      inputSpec: null,
    });
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("itm-workspace");
    expect(ids).toContain("itm-client");
    expect(ids).toContain("itm-input");
    expect(ids).toContain("itm-project-files");
  });

  it("names the output document from the spec", () => {
    const named = deriveWorkflowGraph(SUBMISSION_PACK);
    expect(named.nodes.find((n) => n.id === "out")!.title).toBe("Submission pack");

    const unnamed = deriveWorkflowGraph({ ...SUBMISSION_PACK, outputSpec: { output: "document" } });
    expect(unnamed.nodes.find((n) => n.id === "out")!.title).toBe("Output document");
  });

  it("collapses to skill + engine + output when nothing else is configured", () => {
    const graph = deriveWorkflowGraph({
      name: "Minimal",
      promptTemplate: "Hello {{candidate_name}}, today is {{today}}.",
      inputSpec: null,
    });
    expect(graph.nodes.map((n) => n.id)).toEqual(["skill", "step", "out"]);
    expect(graph.edges.map((e) => e.kind)).toEqual(["skill", "output"]);
  });

  it("shows the provider/model line on the step node only when given", () => {
    const withModel = deriveWorkflowGraph({
      ...SUBMISSION_PACK,
      model: { providerLabel: "Anthropic", modelId: "claude-sonnet-4-6" },
    });
    expect(withModel.nodes.find((n) => n.id === "step")!.modelLine).toBe(
      "Anthropic · claude-sonnet-4-6",
    );

    const without = deriveWorkflowGraph({ ...SUBMISSION_PACK, model: null });
    expect(without.nodes.find((n) => n.id === "step")!.modelLine).toBeUndefined();
  });

  it("routes connector logos to the nodes their data feeds", () => {
    const graph = deriveWorkflowGraph({
      ...SUBMISSION_PACK,
      connections: [
        { provider: "greenhouse" }, // ats → CV item
        { provider: "hubspot" }, // crm → client knowledge item
        { provider: "google-sheets" }, // data → project group header
        { provider: "hunter" }, // tool → nowhere (v1)
      ],
    });
    expect(graph.nodes.find((n) => n.id === "itm-cv")!.brandLogos).toEqual([
      "greenhouse",
    ]);
    expect(graph.nodes.find((n) => n.id === "itm-client")!.brandLogos).toEqual([
      "hubspot",
    ]);
    expect(graph.nodes.find((n) => n.id === "grp-project")!.brandLogos).toEqual(
      ["google-sheets"],
    );
    expect(graph.nodes.flatMap((n) => n.brandLogos ?? [])).not.toContain(
      "hunter",
    );

    const bare = deriveWorkflowGraph(SUBMISSION_PACK);
    for (const node of bare.nodes) {
      expect(node.brandLogos ?? []).toHaveLength(0);
    }
  });

});
