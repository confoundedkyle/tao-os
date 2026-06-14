import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { listLibraryAgents, listLibraryWorkflows } from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  connectorsForCategory,
  requiredConnectorCategories,
  type ConnectorCategory,
} from "@/lib/connectors";
import { agentDocSpec, DOC_TYPE_LABELS } from "@/lib/workflow-graph";
import type { LibraryAgent, LibraryWorkflow } from "@/lib/types";

// Public, unauthenticated catalog of installable Library workflows and agents
// for the marketing site. Exposes marketing metadata only — never users'
// private imported copies, and not the full prompt_template / instructions.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

/** A connector category the item works with, plus the named connectors that
 *  satisfy it — e.g. category "ATS" → ["Ashby", "Greenhouse", "Lever", …].
 *  A category-generic agent works with any one of these interchangeably. */
export interface ConnectorRequirement {
  category: string;
  label: string;
  connectors: string[];
}

/** The project documents an item reads, as human labels. */
export interface DocumentRequirements {
  /** Must exist before a run (e.g. ["Job description"]). */
  required: string[];
  /** Used when present (e.g. ["CV", "Intake notes"]). */
  optional: string[];
}

export interface PublicLibraryItem {
  type: "workflow" | "agent";
  slug: string;
  name: string;
  description: string;
  category: string | null;
  /** Where the agent belongs: "recruiting-project" | "business-development".
   *  Null for workflows. */
  context: string | null;
  version: number;
  featured: boolean;
  /** Connector categories the agent needs, each with its compatible connectors. */
  connectors: ConnectorRequirement[];
  /** Project documents the item reads from. */
  documents: DocumentRequirements;
  /** Human label of what it produces. */
  output: string;
  /** Absolute URL of the 16:9 SVG cover diagram. */
  coverUrl: string;
  /** One-sentence social/OG description. */
  ogDescription: string | null;
  /** Hero teaser paragraph shown under the page heading. */
  lead: string | null;
  /** Long markdown body (h2+) for the detail page. */
  longDescription: string | null;
}

/** Absolute base URL for cover links — taken from the host that served this
 *  request (so it's correct on any port/proxy), falling back to APP_BASE_URL. */
function requestBaseUrl(request: Request): string {
  const h = request.headers;
  const url = new URL(request.url);
  const proto = h.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? url.host;
  return host ? `${proto}://${host}` : env.appBaseUrl;
}

function coverUrl(base: string, type: "workflow" | "agent", slug: string): string {
  return `${base}/api/v1/library/${type}/${slug}/cover`;
}

function connectorRequirement(category: ConnectorCategory): ConnectorRequirement {
  return {
    category,
    label: CONNECTOR_CATEGORY_LABELS[category],
    connectors: connectorsForCategory(category).map((c) => c.name),
  };
}

function docLabels(types: string[]): string[] {
  return types.map((t) => DOC_TYPE_LABELS[t] ?? t);
}

function workflowItem(wf: LibraryWorkflow, base: string): PublicLibraryItem {
  const required = wf.input_spec?.required_doc_types ?? [];
  const inputs = wf.input_spec?.input_doc_types ?? [];
  return {
    type: "workflow",
    slug: wf.slug,
    name: wf.name,
    description: wf.description,
    category: wf.category,
    context: null,
    version: wf.version,
    featured: wf.featured ?? false,
    connectors: [],
    documents: {
      required: docLabels(required),
      optional: docLabels(inputs.filter((t) => !required.includes(t))),
    },
    output: wf.output_spec?.name ?? "Document",
    coverUrl: coverUrl(base, "workflow", wf.slug),
    ogDescription: wf.og_description ?? null,
    lead: wf.lead ?? null,
    longDescription: wf.long_description ?? null,
  };
}

function agentItem(a: LibraryAgent, base: string): PublicLibraryItem {
  const categories = requiredConnectorCategories(a.allowed_tools ?? []);
  const spec = agentDocSpec(a.slug);
  return {
    type: "agent",
    slug: a.slug,
    name: a.name,
    description: a.description,
    category: null,
    context: a.context ?? "recruiting-project",
    version: a.version,
    featured: a.featured ?? false,
    connectors: categories.map(connectorRequirement),
    documents: {
      required: docLabels(spec?.required ?? []),
      optional: docLabels(spec?.optional ?? []),
    },
    output: categories.includes("email") ? "Emails" : "Document",
    coverUrl: coverUrl(base, "agent", a.slug),
    ogDescription: a.og_description ?? null,
    lead: a.lead ?? null,
    longDescription: a.long_description ?? null,
  };
}

export async function GET(request: Request) {
  const base = requestBaseUrl(request);
  const [workflows, agents] = await Promise.all([
    listLibraryWorkflows(),
    listLibraryAgents(),
  ]);
  return NextResponse.json(
    {
      workflows: workflows.map((wf) => workflowItem(wf, base)),
      agents: agents.map((a) => agentItem(a, base)),
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": CACHE } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
