import { NextResponse } from "next/server";
import {
  getLibraryAgentBySlug,
  getLibraryWorkflowBySlug,
} from "@/lib/queries";
import {
  deriveLibraryAgentGraph,
  deriveWorkflowGraph,
  type WorkflowGraph,
} from "@/lib/workflow-graph";
import { renderGraphCoverSvg } from "@/lib/cover-svg";

// Public 16:9 SVG cover for one Library item — the canvas diagram in static
// form, derived without a workspace (no model line, generic connectors).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; slug: string }> },
) {
  const { type, slug } = await params;

  let graph: WorkflowGraph | null = null;
  if (type === "workflow") {
    const wf = await getLibraryWorkflowBySlug(slug);
    if (wf) {
      graph = deriveWorkflowGraph({
        name: wf.name,
        promptTemplate: wf.prompt_template,
        inputSpec: wf.input_spec,
        outputSpec: wf.output_spec,
        model: null,
        connections: [],
      });
    }
  } else if (type === "agent") {
    const agent = await getLibraryAgentBySlug(slug);
    if (agent) {
      graph = deriveLibraryAgentGraph({
        name: agent.name,
        allowedTools: agent.allowed_tools ?? [],
        slug: agent.slug,
        description: agent.description,
      });
    }
  } else {
    return NextResponse.json(
      { error: "type must be 'workflow' or 'agent'" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!graph) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return new Response(renderGraphCoverSvg(graph), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE,
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
