// Pure module: derives a node-graph visualization from a workflow's
// configuration (input/output specs + prompt template placeholders).
// Deliberately free of server-only/db imports so it can run in server
// components today and client-side live previews later.
//
// Canvas shape (4 columns):
//   Knowledge group → Project group → Skill + AI Engine → Output document
//   (workspace/client KB)  (docs, some required)          (name from YAML)
// The Skill (named after the workflow) sits above the AI Engine and defines
// what the engine produces; the engine shows the provider · model.

import type { InputSpec, OutputSpec } from "./types";
import {
  CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  requiredConnectorCategories,
} from "./connectors";

export type WorkflowNodeKind = "group" | "item" | "skill" | "step" | "output";

export type WorkflowNodeIcon =
  | "doc"
  | "notes"
  | "files"
  | "workspace"
  | "client"
  | "connector"
  | "email"
  | "skill"
  | "spark"
  | "robot"
  | "output";

export interface WorkflowGraphNode {
  id: string;
  kind: WorkflowNodeKind;
  title: string;
  subtitle?: string;
  icon?: WorkflowNodeIcon;
  /** Amber chip on item nodes, e.g. "Required". */
  badge?: string;
  /** Provider + model shown on the step node, e.g. "Anthropic · claude-sonnet-4-6". */
  modelLine?: string;
  /** Full skill instructions — shown scrollable when the skill node is opened. */
  prompt?: string;
  /** Connector provider slugs rendered as brand-logo avatars. */
  brandLogos?: string[];
  /** Container node this item sits inside (position becomes relative). */
  parentId?: string;
  /** Explicit box size — set on group nodes so the container renders. */
  size?: { width: number; height: number };
  position: { x: number; y: number };
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "knowledge" | "project" | "skill" | "output";
}

export interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  /** Pixel bounds of the laid-out graph — lets the canvas render at natural
   *  scale inside a scrollable container instead of shrinking to fit. */
  width: number;
  height: number;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  cv: "CV",
  intake_notes: "Intake notes",
  note: "Note",
  scorecard: "Scorecard",
  jd: "Job description",
  output: "Previous AI output",
  other: "File",
};

const DOC_TYPE_ICONS: Record<string, WorkflowNodeIcon> = {
  cv: "doc",
  intake_notes: "notes",
  note: "notes",
  scorecard: "notes",
  jd: "doc",
  output: "doc",
  other: "files",
};

/** Documents an agent reads from the project, split into ones that MUST exist
 *  before a run (required) and ones it uses when present (optional). */
export interface AgentDocSpec {
  required: string[];
  optional: string[];
}

/**
 * Project documents each library agent reads, by slug — curated from the
 * agents' original input specs. Drives the "Documents" node on the canvas and
 * the run-panel readiness gate. Agents that work purely from connected data
 * sources (e.g. client-prospecting-research) are omitted — no documents to show.
 */
const AGENT_DOCUMENTS: Record<string, AgentDocSpec> = {
  "intake-to-jd-builder": { required: ["intake_notes"], optional: ["jd"] },
  "job-requirement-analysis": {
    required: ["intake_notes"],
    optional: ["jd"],
  },
  "candidate-scorecard-rubric": { required: ["jd"], optional: [] },
  "sourcing-strategy-map": { required: ["jd"], optional: [] },
  "job-selling-pitch": { required: ["jd"], optional: ["intake_notes"] },
  "outreach-writer": { required: ["jd"], optional: ["cv"] },
  "cv-screener": {
    required: ["jd"],
    optional: ["cv", "intake_notes", "scorecard"],
  },
  "screening-call-prep": {
    required: [],
    optional: ["cv", "jd", "intake_notes", "scorecard"],
  },
  "submission-pack": { required: ["jd"], optional: ["cv", "output"] },
  "candidate-marketing-profile": { required: ["cv"], optional: [] },
  "sourcing-shortlist-ats": { required: [], optional: ["jd"] },
  "sourcing-shortlist-sheet": { required: [], optional: ["jd"] },
  "candidate-outreach-email": { required: [], optional: ["jd"] },
};

/** The required/optional project documents for an agent slug, or null. */
export function agentDocSpec(slug?: string): AgentDocSpec | null {
  return (slug && AGENT_DOCUMENTS[slug]) || null;
}

// Layout constants — item cards inside group boxes, fixed column grid.
export const ITEM_W = 236;
export const ITEM_H = 60;
const ITEM_GAP = 10;
const GROUP_PAD = 14;
const GROUP_HEADER = 42;
export const GROUP_W = ITEM_W + GROUP_PAD * 2;
export const STEP_W = 264;
export const STEP_H = 96;
export const SKILL_H = 76;
const SKILL_GAP = 52; // vertical gap for the skill → engine edge
export const OUTPUT_W = 240;
export const OUTPUT_H = 64;
const COL_GAP = 72;

function groupHeight(itemCount: number): number {
  return (
    GROUP_HEADER + itemCount * ITEM_H + (itemCount - 1) * ITEM_GAP + GROUP_PAD
  );
}

const CONNECTOR_CATEGORY_BY_PROVIDER = new Map(
  CONNECTORS.filter((c) => c.provider).map((c) => [c.provider!, c.category]),
);

interface Item {
  id: string;
  title: string;
  subtitle?: string;
  icon: WorkflowNodeIcon;
  badge?: string;
  brandLogos?: string[];
}

export function deriveWorkflowGraph(args: {
  name: string;
  promptTemplate: string;
  inputSpec: InputSpec | null;
  outputSpec?: OutputSpec | null;
  /** Workspace's primary run model; omitted from the step node when null. */
  model?: { providerLabel: string; modelId: string } | null;
  /** Active workspace connections — brand logos land where their data feeds. */
  connections?: { provider: string }[];
}): WorkflowGraph {
  const { promptTemplate, inputSpec } = args;

  const found = new Set<string>();
  for (const match of promptTemplate.matchAll(/\{\{(\w+)\}\}/g)) {
    found.add(match[1]);
  }
  const hasInputPlaceholder =
    found.has("input_document") || found.has("input_documents");

  const logosByCategory = new Map<string, string[]>();
  for (const { provider } of args.connections ?? []) {
    const category = CONNECTOR_CATEGORY_BY_PROVIDER.get(provider);
    if (!category) continue;
    const list = logosByCategory.get(category) ?? [];
    list.push(provider);
    logosByCategory.set(category, list);
  }

  // --- Knowledge group: from the spec, falling back to template placeholders
  // for custom workflows that have no library spec.
  const knowledgeSources =
    inputSpec?.knowledge ??
    [
      found.has("workspace_kb") && "workspace",
      (found.has("client_kb") || found.has("client_files")) && "client",
    ].filter((s): s is string => Boolean(s));

  const knowledgeItems: Item[] = [];
  if (knowledgeSources.includes("workspace")) {
    knowledgeItems.push({
      id: "itm-workspace",
      title: "Workspace knowledge",
      subtitle: "Your agency's KB",
      icon: "workspace",
    });
  }
  if (knowledgeSources.includes("client")) {
    knowledgeItems.push({
      id: "itm-client",
      title: "Client knowledge",
      subtitle: "KB + files for this client",
      icon: "client",
      brandLogos: logosByCategory.get("crm"),
    });
  }

  // --- Project group: required docs + run-time inputs from the spec; custom
  // workflows fall back to what the template references.
  const projectItems: Item[] = [];
  for (const docType of inputSpec?.required_doc_types ?? []) {
    projectItems.push({
      id: `itm-${docType}`,
      title: DOC_TYPE_LABELS[docType] ?? docType,
      icon: DOC_TYPE_ICONS[docType] ?? "doc",
      badge: "Required",
    });
  }
  if (hasInputPlaceholder) {
    const inputTypes = (inputSpec?.input_doc_types ?? []).filter(
      (t) => !inputSpec?.required_doc_types?.includes(t),
    );
    if (inputTypes.length > 0) {
      for (const docType of inputTypes) {
        projectItems.push({
          id: `itm-${docType}`,
          title: DOC_TYPE_LABELS[docType] ?? docType,
          subtitle: "You pick at run time",
          icon: DOC_TYPE_ICONS[docType] ?? "doc",
          brandLogos: docType === "cv" ? logosByCategory.get("ats") : undefined,
        });
      }
    } else if (!inputSpec) {
      projectItems.push({
        id: "itm-input",
        title: "Run input",
        subtitle: "Notes or files you add",
        icon: "notes",
        brandLogos: logosByCategory.get("ats"),
      });
    }
  }
  if (!inputSpec && found.has("project_files")) {
    projectItems.push({
      id: "itm-project-files",
      title: "Project files",
      icon: "files",
    });
  }

  return composeGraph({
    groups: [
      { id: "grp-knowledge", title: "Knowledge", items: knowledgeItems, edgeKind: "knowledge" },
      {
        id: "grp-project",
        title: "Project",
        items: projectItems,
        edgeKind: "project",
        brandLogos: logosByCategory.get("data"),
      },
    ],
    skill: { title: args.name, subtitle: "Skill · defines what to produce" },
    engineSubtitle: "1 LLM call",
    model: args.model ?? null,
    output: {
      title: args.outputSpec?.name ?? "Output document",
      subtitle: "Saved to project files",
    },
  });
}

interface GroupSpec {
  id: string;
  title: string;
  items: Item[];
  edgeKind: WorkflowGraphEdge["kind"];
  brandLogos?: string[];
}

/** Shared 4-column layout: group boxes → skill above AI engine → output. */
function composeGraph(spec: {
  groups: GroupSpec[];
  skill: { title: string; subtitle: string; prompt?: string };
  engineSubtitle: string;
  /** "spark" = workflow engine; "robot" = the advanced agent engine. */
  engineIcon?: WorkflowNodeIcon;
  model: { providerLabel: string; modelId: string } | null;
  output: {
    title: string;
    subtitle: string;
    icon?: WorkflowNodeIcon;
    badge?: string;
    brandLogos?: string[];
  };
}): WorkflowGraph {
  const nodes: WorkflowGraphNode[] = [];
  const edges: WorkflowGraphEdge[] = [];

  const groups = spec.groups.filter((g) => g.items.length > 0);
  const stackHeight = SKILL_H + SKILL_GAP + STEP_H; // skill above the engine
  const maxHeight = Math.max(
    ...groups.map((g) => groupHeight(g.items.length)),
    stackHeight,
    OUTPUT_H,
  );
  let x = 0;

  for (const group of groups) {
    const height = groupHeight(group.items.length);
    nodes.push({
      id: group.id,
      kind: "group",
      title: group.title,
      brandLogos: group.brandLogos,
      size: { width: GROUP_W, height },
      position: { x, y: (maxHeight - height) / 2 },
    });
    group.items.forEach((item, i) => {
      nodes.push({
        ...item,
        kind: "item",
        parentId: group.id,
        size: { width: ITEM_W, height: ITEM_H },
        position: {
          x: GROUP_PAD,
          y: GROUP_HEADER + i * (ITEM_H + ITEM_GAP),
        },
      });
    });
    edges.push({
      id: `e-${group.id}`,
      source: group.id,
      target: "step",
      kind: group.edgeKind,
    });
    x += GROUP_W + COL_GAP;
  }

  // The engine sits on the flow midline; the skill floats above it.
  const engineY = (maxHeight - STEP_H) / 2;
  nodes.push({
    id: "skill",
    kind: "skill",
    title: spec.skill.title,
    subtitle: spec.skill.subtitle,
    prompt: spec.skill.prompt,
    icon: "skill",
    position: { x, y: engineY - SKILL_GAP - SKILL_H },
  });
  nodes.push({
    id: "step",
    kind: "step",
    title: "AI Engine",
    subtitle: spec.engineSubtitle,
    icon: spec.engineIcon ?? "spark",
    modelLine: spec.model
      ? `${spec.model.providerLabel} · ${spec.model.modelId}`
      : undefined,
    position: { x, y: engineY },
  });
  edges.push({ id: "e-skill", source: "skill", target: "step", kind: "skill" });
  x += STEP_W + COL_GAP;

  nodes.push({
    id: "out",
    kind: "output",
    title: spec.output.title,
    subtitle: spec.output.subtitle,
    icon: spec.output.icon ?? "output",
    badge: spec.output.badge,
    brandLogos: spec.output.brandLogos,
    position: { x, y: (maxHeight - OUTPUT_H) / 2 },
  });
  edges.push({ id: "e-out", source: "step", target: "out", kind: "output" });

  // The skill may sit above y 0 when the engine stack is the tallest column —
  // shift everything down so the graph's bounds start at (0, 0).
  const minY = Math.min(0, engineY - SKILL_GAP - SKILL_H);
  if (minY < 0) {
    for (const node of nodes) {
      if (!node.parentId) node.position.y -= minY;
    }
  }
  return {
    nodes,
    edges,
    width: x + OUTPUT_W,
    height: maxHeight - minY,
  };
}

/** One connector slot on the agent canvas — a category the agent needs and
 *  what the user picked for it. */
export interface AgentConnectorSlot {
  category: string;
  categoryLabel: string;
  /** Provider slug the user picked, or null when none is connected/selected. */
  selectedProvider: string | null;
  /** Display name for the selected provider. */
  selectedLabel?: string;
}

/** Graph for a category-generic agent: Knowledge → Connectors (the user's
 *  picks) → Skill + AI Engine → Output. Pure and client-safe so the canvas
 *  can re-derive live as the user changes a connector picker. */
export function deriveAgentGraph(args: {
  name: string;
  connectors: AgentConnectorSlot[];
  model?: { providerLabel: string; modelId: string } | null;
  /** Library slug — drives the "Documents" node (JD, intake notes, CVs …). */
  slug?: string;
  /** Shown under the "Advanced skill" node — a detailed description of the task. */
  description?: string;
  /** The agent's full instructions — shown when the skill node is opened. */
  instructions?: string;
  /** "live" = the run panel (unselected → "No X connected · Missing");
   *  "catalog" = the public marketing cover (unselected → "Any X connector"). */
  variant?: "live" | "catalog";
}): WorkflowGraph {
  const catalog = args.variant === "catalog";
  const knowledgeItems: Item[] = [
    {
      id: "itm-workspace",
      title: "Workspace knowledge",
      subtitle: "Your agency's KB",
      icon: "workspace",
    },
    {
      id: "itm-client",
      title: "Client knowledge",
      subtitle: "KB + files for this client",
      icon: "client",
    },
  ];

  // Documents the agent reads from the project (JD, intake notes, CVs …).
  const docSpec = agentDocSpec(args.slug);
  const documentItems: Item[] = docSpec
    ? [
        ...docSpec.required.map((docType) => ({
          id: `itm-doc-${docType}`,
          title: DOC_TYPE_LABELS[docType] ?? docType,
          subtitle: "Read from the project",
          icon: DOC_TYPE_ICONS[docType] ?? ("doc" as WorkflowNodeIcon),
          badge: "Required",
        })),
        ...docSpec.optional.map((docType) => ({
          id: `itm-doc-${docType}`,
          title: DOC_TYPE_LABELS[docType] ?? docType,
          subtitle: "Optional · used if present",
          icon: DOC_TYPE_ICONS[docType] ?? ("doc" as WorkflowNodeIcon),
        })),
      ]
    : [];

  // Email connectors are the agent's DESTINATION, not a source — they render
  // as the output node ("Emails via Gmail"), not inside the Connectors group.
  const emailSlot = args.connectors.find((slot) => slot.category === "email");
  const inputSlots = args.connectors.filter((slot) => slot.category !== "email");

  const connectorItems: Item[] = inputSlots.map((slot) =>
    slot.selectedProvider
      ? {
          id: `itm-conn-${slot.category}`,
          title: slot.selectedLabel ?? slot.selectedProvider,
          subtitle: `${slot.categoryLabel} connector`,
          icon: "connector",
          brandLogos: [slot.selectedProvider],
        }
      : catalog
        ? {
            id: `itm-conn-${slot.category}`,
            title: `Any ${slot.categoryLabel}`,
            subtitle: `${slot.categoryLabel} connector`,
            icon: "connector",
          }
        : {
            id: `itm-conn-${slot.category}`,
            title: `No ${slot.categoryLabel} connected`,
            subtitle: "Connect one to run this agent",
            icon: "connector",
            badge: "Missing",
          },
  );

  const output = emailSlot
    ? emailSlot.selectedProvider
      ? {
          title: `Emails via ${emailSlot.selectedLabel ?? emailSlot.selectedProvider}`,
          subtitle: "Sent from your own mailbox",
          icon: "email" as const,
          brandLogos: [emailSlot.selectedProvider],
        }
      : catalog
        ? {
            title: "Emails",
            subtitle: "Sent from a connected mailbox",
            icon: "email" as const,
          }
        : {
            title: "Emails",
            subtitle: "Connect an email connector to send",
            icon: "email" as const,
            badge: "Missing",
          }
    : { title: "Output document", subtitle: "Saved to project files" };

  return composeGraph({
    groups: [
      { id: "grp-knowledge", title: "Knowledge", items: knowledgeItems, edgeKind: "knowledge" },
      { id: "grp-documents", title: "Documents", items: documentItems, edgeKind: "project" },
      { id: "grp-connectors", title: "Connectors", items: connectorItems, edgeKind: "project" },
    ],
    skill: {
      title: "Advanced skill",
      subtitle: args.description?.trim() || "Defines the task this agent runs",
      prompt: args.instructions,
    },
    engineSubtitle: "Autonomous · multi-step tool loop",
    engineIcon: "robot",
    model: args.model ?? null,
    output,
  });
}

/** Catalog-mode agent graph straight from a library agent's allowed_tools —
 *  no workspace, so connectors render generically ("Any ATS connector"). */
export function deriveLibraryAgentGraph(args: {
  name: string;
  allowedTools: string[];
  slug?: string;
  description?: string;
}): WorkflowGraph {
  const connectors: AgentConnectorSlot[] = requiredConnectorCategories(
    args.allowedTools,
  ).map((category) => ({
    category,
    categoryLabel: CONNECTOR_CATEGORY_LABELS[category],
    selectedProvider: null,
  }));
  return deriveAgentGraph({
    name: args.name,
    connectors,
    variant: "catalog",
    slug: args.slug,
    description: args.description,
  });
}
