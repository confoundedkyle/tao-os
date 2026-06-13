import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { listLibraryAgents, listLibraryWorkflows } from "@/lib/queries";
import {
  CONNECTOR_CATEGORY_LABELS,
  connectorsForCategory,
  requiredConnectorCategories,
  type ConnectorCategory,
} from "@/lib/connectors";
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

export interface PublicLibraryItem {
  type: "workflow" | "agent";
  slug: string;
  name: string;
  description: string;
  category: string | null;
  version: number;
  featured: boolean;
  /** Connector categories the agent needs, each with its compatible connectors. */
  connectors: ConnectorRequirement[];
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

function coverUrl(type: "workflow" | "agent", slug: string): string {
  const base = env.appBaseUrl || "";
  return `${base}/api/v1/library/${type}/${slug}/cover`;
}

function connectorRequirement(category: ConnectorCategory): ConnectorRequirement {
  return {
    category,
    label: CONNECTOR_CATEGORY_LABELS[category],
    connectors: connectorsForCategory(category).map((c) => c.name),
  };
}

function workflowItem(wf: LibraryWorkflow): PublicLibraryItem {
  return {
    type: "workflow",
    slug: wf.slug,
    name: wf.name,
    description: wf.description,
    category: wf.category,
    version: wf.version,
    featured: wf.featured ?? false,
    connectors: [],
    output: wf.output_spec?.name ?? "Document",
    coverUrl: coverUrl("workflow", wf.slug),
    ogDescription: wf.og_description ?? null,
    lead: wf.lead ?? null,
    longDescription: wf.long_description ?? null,
  };
}

function agentItem(a: LibraryAgent): PublicLibraryItem {
  const categories = requiredConnectorCategories(a.allowed_tools ?? []);
  return {
    type: "agent",
    slug: a.slug,
    name: a.name,
    description: a.description,
    category: null,
    version: a.version,
    featured: a.featured ?? false,
    connectors: categories.map(connectorRequirement),
    output: categories.includes("email") ? "Emails" : "Document",
    coverUrl: coverUrl("agent", a.slug),
    ogDescription: a.og_description ?? null,
    lead: a.lead ?? null,
    longDescription: a.long_description ?? null,
  };
}

export async function GET() {
  const [workflows, agents] = await Promise.all([
    listLibraryWorkflows(),
    listLibraryAgents(),
  ]);
  return NextResponse.json(
    {
      workflows: workflows.map(workflowItem),
      agents: agents.map(agentItem),
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": CACHE } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
