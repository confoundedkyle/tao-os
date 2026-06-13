// Pure module: renders a WorkflowGraph (from lib/workflow-graph.ts) as a
// static 16:9 SVG cover image, reproducing the look of the React Flow canvas
// in components/workflow-canvas.tsx. No dependencies, no DOM — usable in a
// route handler (and, later, as the input to a PNG rasterizer).

import {
  GROUP_W,
  ITEM_H,
  OUTPUT_H,
  SKILL_H,
  STEP_H,
  STEP_W,
  type WorkflowGraph,
  type WorkflowGraphNode,
  type WorkflowNodeIcon,
} from "./workflow-graph";

const W = 1600;
const H = 900;
const PAD = 80;

// Icon-tile gradients — the TILE_GRADIENTS map from workflow-canvas.tsx,
// resolved from Tailwind tokens (globals.css) to [from, to] hex.
const TILE_GRADIENTS: Record<WorkflowNodeIcon, [string, string]> = {
  workspace: ["#c5b6ee", "#8b6fd8"],
  client: ["#9cc3f0", "#5688d4"],
  doc: ["#5bc8a8", "#1b7a5f"],
  notes: ["#e2a33c", "#b97c1f"],
  files: ["#62749c", "#1b2a4a"],
  connector: ["#9cc3f0", "#1b2a4a"],
  email: ["#e2a33c", "#e8836b"],
  skill: ["#e8836b", "#c4523a"],
  spark: ["#1b2a4a", "#1b7a5f"],
  robot: ["#5bc8a8", "#9cc3f0"],
  output: ["#1b7a5f", "#1b2a4a"],
};

const EDGE: Record<string, { stroke: string; width: number; dash?: string }> = {
  knowledge: { stroke: "rgba(27,42,74,0.35)", width: 1.75, dash: "6 4" },
  project: { stroke: "#5bc8a8", width: 2.25 },
  skill: { stroke: "#e8836b", width: 2.25 },
  output: { stroke: "#1b7a5f", width: 2.5 },
};
const ARROW: Record<string, string> = {
  knowledge: "rgba(27,42,74,0.45)",
  project: "#5bc8a8",
  skill: "#e8836b",
  output: "#1b7a5f",
};

const NAVY900 = "#131f38";
const NAVY800 = "#1b2a4a";

// Icon inner markup (24×24 viewBox) — the canvas icons from components/icons.tsx.
// {F} = translucent glyph fill, drawn with stroke=currentColor in the group.
const ICONS: Record<WorkflowNodeIcon, string> = {
  workspace:
    '<ellipse cx="12" cy="5.5" rx="7" ry="2.8" fill="{F}"/><path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  client:
    '<rect x="4" y="6" width="10" height="15" rx="1.5" fill="{F}"/><path d="M14 10h5a1 1 0 0 1 1 1v10"/><path d="M2 21h20"/><path d="M7.5 10h3M7.5 13.5h3M7.5 17h3M17 14h.01M17 17.5h.01"/>',
  doc: '<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill="{F}"/><path d="M14 3v4h4"/><path d="m9 14 2.2 2.2L15.5 12"/>',
  notes:
    '<rect x="4" y="3.5" width="16" height="17" rx="2" fill="{F}"/><path d="M8 8h8M8 12h4"/><path d="m8.5 16.5 1.6 1.6 3-3"/>',
  files:
    '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6.5Z" fill="{F}"/><path d="M3 10.5h18"/>',
  connector:
    '<path d="M8 7h8v4a4 4 0 0 1-4 4 4 4 0 0 1-4-4V7Z" fill="{F}"/><path d="M9.5 7V3.5M14.5 7V3.5M12 15v2.5a3 3 0 0 1-3 3H7"/>',
  email:
    '<rect x="3" y="5.5" width="18" height="13" rx="2" fill="{F}"/><path d="m4 7.5 8 6 8-6"/>',
  skill:
    '<rect x="3" y="3" width="6" height="6" rx="2" fill="{F}"/><rect x="15" y="15" width="6" height="6" rx="2"/><circle cx="18" cy="6" r="3"/><path d="M9 6h6M6 9v6a3 3 0 0 0 3 3h6"/>',
  spark:
    '<path d="M12 3.5c.9 4.4 3.1 6.6 7.5 7.5-4.4.9-6.6 3.1-7.5 7.5-.9-4.4-3.1-6.6-7.5-7.5 4.4-.9 6.6-3.1 7.5-7.5Z" fill="{F}"/><path d="M19 16.5c.4 1.8 1.2 2.6 3 3-1.8.4-2.6 1.2-3 3-.4-1.8-1.2-2.6-3-3 1.8-.4 2.6-1.2 3-3Z"/>',
  robot:
    '<rect x="5" y="8" width="14" height="10.5" rx="2.5" fill="{F}"/><path d="M12 8V5.2"/><circle cx="12" cy="3.9" r="1.2"/><circle cx="9.3" cy="12.6" r="1" fill="{S}" stroke="none"/><circle cx="14.7" cy="12.6" r="1" fill="{S}" stroke="none"/><path d="M9.2 15.8h5.6"/><path d="M5 12.5H3.2M20.8 12.5H19"/>',
  output:
    '<path d="M12 3.5c3.5 1.5 5.5 5 5.5 9l-2.5 2.5h-6L6.5 12.5c0-4 2-7.5 5.5-9Z" fill="{F}"/><circle cx="12" cy="9.5" r="1.6"/><path d="M9 15v3.5l3-1.5 3 1.5V15M12 18.5V21"/>',
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Greedy word-wrap to at most maxLines, ellipsising the overflow. */
function wrap(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const cw = fontSize * 0.55; // approximate average glyph advance
  const max = Math.max(1, Math.floor(maxWidth / cw));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // Truncate the last line if content remains.
  const used = lines.join(" ").length;
  if (used < text.replace(/\s+/g, " ").length && lines.length) {
    let last = lines[lines.length - 1];
    if (last.length > max - 1) last = last.slice(0, Math.max(1, max - 1));
    lines[lines.length - 1] = `${last.replace(/\s+$/, "")}…`;
  }
  return lines.length ? lines : [text];
}

function truncate(text: string, maxWidth: number, fontSize: number): string {
  const cw = fontSize * 0.55;
  const max = Math.max(1, Math.floor(maxWidth / cw));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function tile(x: number, y: number, size: number, icon: WorkflowNodeIcon): string {
  const dark = icon === "robot"; // light gradient → navy glyph
  const glyph = dark ? NAVY900 : "#ffffff";
  const fill = dark ? "rgba(19,31,56,0.18)" : "rgba(255,255,255,0.25)";
  const inner = ICONS[icon]
    .replace(/\{F\}/g, fill)
    .replace(/\{S\}/g, glyph);
  const ip = size * 0.52; // icon size within the tile
  const off = (size - ip) / 2;
  const s = ip / 24;
  return (
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="url(#g-${icon})"/>` +
    `<g transform="translate(${x + off} ${y + off}) scale(${s})" fill="none" stroke="${glyph}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
  );
}

function textLines(
  lines: { text: string; size: number; weight: number; fill: string; mono?: boolean }[],
  x: number,
  centerY: number,
): string {
  const lh = lines.map((l) => l.size * 1.32);
  const total = lh.reduce((a, b) => a + b, 0);
  let top = centerY - total / 2;
  let out = "";
  lines.forEach((l, i) => {
    const baseline = top + l.size * 0.82;
    const family = l.mono
      ? "'JetBrains Mono', ui-monospace, monospace"
      : "'Space Grotesk', 'Inter', system-ui, sans-serif";
    out += `<text x="${x}" y="${baseline}" font-family="${family}" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}">${esc(l.text)}</text>`;
    top += lh[i];
  });
  return out;
}

function badgePill(xRight: number, y: number, label: string): string {
  const w = label.length * 6.2 + 14;
  const x = xRight - w;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="rgba(226,163,60,0.2)"/>` +
    `<text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="9" font-weight="700" fill="#e2a33c" letter-spacing="0.5">${esc(label.toUpperCase())}</text>`
  );
}

function card(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill: string; stroke: string },
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${opts.fill}" stroke="${opts.stroke}" stroke-width="1.5"/>`;
}

function renderItem(n: WorkflowGraphNode, ax: number, ay: number): string {
  const h = n.size?.height ?? ITEM_H;
  const w = n.size?.width ?? 236;
  const tileSize = 36;
  const tx = ax + 12;
  const ty = ay + (h - tileSize) / 2;
  const textX = tx + tileSize + 10;
  const textW = ax + w - textX - 12;
  const cy = ay + h / 2;
  let out = card(ax, ay, w, h, { fill: "#ffffff", stroke: "rgba(27,42,74,0.1)" });
  out += tile(tx, ty, tileSize, n.icon ?? "doc");
  const lines = [
    {
      text: truncate(n.title, textW - (n.badge ? 56 : 0), 13),
      size: 13,
      weight: 600,
      fill: NAVY900,
    },
  ];
  if (n.subtitle)
    lines.push({ text: truncate(n.subtitle, textW, 11), size: 11, weight: 400, fill: "rgba(27,42,74,0.45)" });
  out += textLines(lines, textX, cy);
  if (n.badge) out += badgePill(ax + w - 12, ay + 11, n.badge);
  return out;
}

function renderGroup(n: WorkflowGraphNode): string {
  const w = n.size?.width ?? GROUP_W;
  const h = n.size?.height ?? 100;
  return (
    `<rect x="${n.position.x}" y="${n.position.y}" width="${w}" height="${h}" rx="16" fill="rgba(255,255,255,0.45)" stroke="rgba(27,42,74,0.2)" stroke-width="1.5" stroke-dasharray="6 5"/>` +
    `<text x="${n.position.x + 14}" y="${n.position.y + 26}" font-family="'Inter', system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="1.3" fill="rgba(27,42,74,0.5)">${esc(n.title.toUpperCase())}</text>`
  );
}

function renderStack(
  n: WorkflowGraphNode,
  w: number,
  h: number,
  tileSize: number,
  titleSize: number,
  opts: { fill: string; stroke: string; titleFill: string; subFill: string; agent?: boolean },
): string {
  const tx = n.position.x + 14;
  const ty = n.position.y + (h - tileSize) / 2;
  const textX = tx + tileSize + 12;
  const textW = n.position.x + w - textX - 14;
  const cy = n.position.y + h / 2;
  let out = `<rect x="${n.position.x}" y="${n.position.y}" width="${w}" height="${h}" rx="14" fill="${opts.fill}" stroke="${opts.stroke}" stroke-width="1.5"/>`;
  out += tile(tx, ty, tileSize, n.icon ?? "spark");
  const titleLines = wrap(n.title, textW - (opts.agent ? 52 : 0), titleSize, 2).map((t) => ({
    text: t,
    size: titleSize,
    weight: 600,
    fill: opts.titleFill,
  }));
  const lines = [...titleLines];
  if (n.subtitle)
    lines.push({ text: truncate(n.subtitle, textW, 11), size: 11, weight: 400, fill: opts.subFill });
  if (n.modelLine)
    lines.push({ text: truncate(n.modelLine, textW, 10), size: 10, weight: 500, fill: opts.subFill });
  out += textLines(lines, textX, cy);
  if (opts.agent) {
    const w2 = 46;
    out +=
      `<rect x="${n.position.x + w - 14 - w2}" y="${n.position.y + 12}" width="${w2}" height="17" rx="8.5" fill="rgba(91,200,168,0.25)"/>` +
      `<text x="${n.position.x + w - 14 - w2 / 2}" y="${n.position.y + 24}" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="9" font-weight="700" fill="#5bc8a8" letter-spacing="0.5">AGENT</text>`;
  }
  return out;
}

function renderNode(n: WorkflowGraphNode, byId: Map<string, WorkflowGraphNode>): string {
  switch (n.kind) {
    case "group":
      return renderGroup(n);
    case "item": {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      const ax = (parent?.position.x ?? 0) + n.position.x;
      const ay = (parent?.position.y ?? 0) + n.position.y;
      return renderItem(n, ax, ay);
    }
    case "skill":
      return renderStack(n, STEP_W, SKILL_H, 40, 14, {
        fill: "#ffffff",
        stroke: "rgba(232,131,107,0.5)",
        titleFill: NAVY900,
        subFill: "rgba(27,42,74,0.45)",
      });
    case "step": {
      const agent = n.icon === "robot";
      return renderStack(n, STEP_W, STEP_H, 48, 15, {
        fill: agent ? "url(#g-stepbg)" : "#ffffff",
        stroke: agent ? "rgba(91,200,168,0.8)" : "rgba(91,200,168,0.7)",
        titleFill: agent ? "#ffffff" : NAVY900,
        subFill: agent ? "rgba(255,255,255,0.55)" : "rgba(27,42,74,0.45)",
        agent,
      });
    }
    case "output":
      return renderStack(n, 240, OUTPUT_H, 40, 14, {
        fill: "#ffffff",
        stroke: "rgba(27,122,95,0.35)",
        titleFill: NAVY900,
        subFill: "rgba(27,42,74,0.45)",
      });
  }
}

function hBezier(sx: number, sy: number, tx: number, ty: number): string {
  const k = Math.max(40, Math.abs(tx - sx) * 0.5);
  return `M ${sx} ${sy} C ${sx + k} ${sy}, ${tx - k} ${ty}, ${tx} ${ty}`;
}
function vBezier(sx: number, sy: number, tx: number, ty: number): string {
  const k = Math.max(28, Math.abs(ty - sy) * 0.6);
  return `M ${sx} ${sy} C ${sx} ${sy + k}, ${tx} ${ty - k}, ${tx} ${ty}`;
}

function renderEdge(
  e: WorkflowGraph["edges"][number],
  byId: Map<string, WorkflowGraphNode>,
): string {
  const src = byId.get(e.source);
  const tgt = byId.get(e.target);
  if (!src || !tgt) return "";
  const st = EDGE[e.kind] ?? EDGE.project;
  let d: string;
  if (e.kind === "skill") {
    // skill bottom → step top
    d = vBezier(
      src.position.x + STEP_W / 2,
      src.position.y + SKILL_H,
      tgt.position.x + STEP_W / 2,
      tgt.position.y,
    );
  } else if (e.kind === "output") {
    // step right → output left
    d = hBezier(
      src.position.x + STEP_W,
      src.position.y + STEP_H / 2,
      tgt.position.x,
      tgt.position.y + OUTPUT_H / 2,
    );
  } else {
    // group right → step left
    const sw = src.size?.width ?? GROUP_W;
    const sh = src.size?.height ?? 100;
    d = hBezier(
      src.position.x + sw,
      src.position.y + sh / 2,
      tgt.position.x,
      tgt.position.y + STEP_H / 2,
    );
  }
  return `<path d="${d}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""} marker-end="url(#a-${e.kind})"/>`;
}

export function renderGraphCoverSvg(graph: WorkflowGraph): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const scale = Math.min((W - 2 * PAD) / graph.width, (H - 2 * PAD) / graph.height);
  const ox = (W - graph.width * scale) / 2;
  const oy = (H - graph.height * scale) / 2;

  const gradientDefs = (Object.keys(TILE_GRADIENTS) as WorkflowNodeIcon[])
    .map((key) => {
      const [from, to] = TILE_GRADIENTS[key];
      return `<linearGradient id="g-${key}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient>`;
    })
    .join("");

  const markerDefs = Object.keys(ARROW)
    .map(
      (kind) =>
        `<marker id="a-${kind}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${ARROW[kind]}"/></marker>`,
    )
    .join("");

  // Edges under nodes; items after their group so they sit on top.
  const ordered = [...graph.nodes].sort((a, b) => {
    const rank = (n: WorkflowGraphNode) => (n.kind === "group" ? 0 : 1);
    return rank(a) - rank(b);
  });
  const edges = graph.edges.map((e) => renderEdge(e, byId)).join("");
  const nodes = ordered.map((n) => renderNode(n, byId)).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">` +
    `<defs>${gradientDefs}${markerDefs}` +
    `<linearGradient id="g-stepbg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${NAVY900}"/><stop offset="100%" stop-color="${NAVY800}"/></linearGradient>` +
    `<linearGradient id="g-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbf7f0"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>` +
    `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="rgba(27,42,74,0.14)"/></pattern>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g-bg)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#dots)"/>` +
    `<g transform="translate(${ox} ${oy}) scale(${scale})">${edges}${nodes}</g>` +
    `</svg>`
  );
}
