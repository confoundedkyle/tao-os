import "server-only";
import type { ConnectorAdapter } from "./types";

// Coresignal (public employment data). Auth is an API key in the `apikey`
// header. Uses the multi-source Employee API: POST es_dsl search (returns ids)
// then GET collect/{id} for full profiles. EVERY successful (200) request
// costs 2 credits and there is no free account endpoint — so validateApiKey
// sends a deliberately malformed query: a 400 proves the key authenticates
// without billing, 401/403 means a bad key. The search tool hydrates only a
// few top profiles to keep credit burn visible and bounded.
const API = "https://api.coresignal.com/cdapi/v2/employee_multi_source";
// The richer Clean Employee API (current vs past title, skills, nested
// experience). The step-ladder tool runs here; the multi-source path above is
// left untouched for the existing search/collect tools.
const CLEAN_API = "https://api.coresignal.com/cdapi/v2/employee_clean";

const DEFAULT_COLLECT = 3;
const HARD_COLLECT = 5;
const CHAR_CAP = 12_000;

// Ladder safety ceilings (the secret spec carries the defaults; these clamp it).
const HARD_MAX_COLLECTS = 15;
const HARD_CREDIT_BUDGET = 80;
const SEARCH_CREDIT_COST = 2; // ~2 credits per 200 es_dsl search
const COLLECT_CREDIT_COST = 2; // ~2 credits per 200 collect
const CLEAN_CHAR_CAP = 14_000;

interface CoresignalExperience {
  company_name?: string | null;
  position_title?: string | null;
  // Clean Employee API exposes the past-role title as `title`; multi-source uses
  // `position_title`. Read both so renderEmployee works on either dataset.
  title?: string | null;
  active_experience?: boolean | number | null;
}

interface CoresignalEmployee {
  id?: number | string;
  full_name?: string | null;
  name?: string | null;
  headline?: string | null;
  job_title?: string | null;
  location_full?: string | null;
  location_raw_address?: string | null;
  location_country?: string | null;
  primary_professional_email?: string | null;
  professional_network_url?: string | null;
  linkedin_url?: string | null;
  experience?: CoresignalExperience[] | null;
}

/** The search intent the Sourcing agent passes to the step-ladder tool — title
 *  tiers + skills/filters, NOT raw DSL. Mirrors the Sourcing Plan's sections. */
export interface CoresignalSourceArgs {
  currentTitles: string[];
  adjacentTitles?: string[];
  skills?: string[];
  keywords?: string;
  companies?: string[];
  location?: string;
  seniority?: string;
  targetCount?: number;
  maxCollects?: number;
  creditBudget?: number;
}

/** One typed, field-agnostic clause in a ladder tier — the interpreter expands
 *  it into ES DSL. `valuesFrom` names a CoresignalSourceArgs field. The actual
 *  fields/ops/order live in the secret spec, not here. */
export interface LadderClause {
  bool: "must" | "should" | "filter" | "must_not";
  op: "match" | "match_phrase" | "term" | "query_string" | "nested";
  field?: string;
  fields?: string[];
  valuesFrom?: string;
  value?: unknown;
  defaultOperator?: "and" | "or";
  path?: string; // op: "nested"
  clauses?: LadderClause[]; // op: "nested"
}

export interface LadderTier {
  name: string;
  weight: number;
  clauses: LadderClause[];
}

export interface CoresignalLadderSpec {
  defaults: { targetCount: number; maxCollects: number; creditBudget: number };
  tiers: LadderTier[];
}

export interface CoresignalAdapter extends ConnectorAdapter {
  searchEmployees(
    apiKey: string,
    args: {
      name?: string;
      title?: string;
      company?: string;
      location?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  collectEmployee(
    apiKey: string,
    idOrShorthand: string,
  ): Promise<{ text: string; found: boolean }>;
  sourceEmployees(
    apiKey: string,
    args: CoresignalSourceArgs,
    spec: CoresignalLadderSpec,
    capRemaining: number | null,
    record?: (credits: number, detail?: unknown) => Promise<void> | void,
  ): Promise<{
    text: string;
    count: number;
    truncated: boolean;
    creditsSpent: number;
  }>;
}

async function request(
  apiKey: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      apikey: apiKey,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function call<T>(apiKey: string, path: string, body?: unknown): Promise<T> {
  const res = await request(apiKey, path, body);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Coresignal error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Same as `call`, but against the Clean Employee API base and surfacing the
 *  remaining-credit header so the ladder can report spend. */
async function callClean<T>(
  apiKey: string,
  path: string,
  body?: unknown,
): Promise<{ json: T; creditsRemaining: number | null }> {
  const res = await fetch(`${CLEAN_API}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      apikey: apiKey,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Coresignal clean error (${res.status}): ${detail}`);
  }
  const rem = res.headers.get("x-credits-remaining");
  return { json: json as T, creditsRemaining: rem != null ? Number(rem) : null };
}

/** Search responses vary by API tier; pull ids out of the common shapes. */
function extractIds(json: unknown): string[] {
  if (Array.isArray(json)) {
    return json
      .map((x) =>
        typeof x === "number" || typeof x === "string"
          ? String(x)
          : String((x as { id?: number | string } | null)?.id ?? ""),
      )
      .filter(Boolean);
  }
  const hits = (json as { hits?: { hits?: { _id?: string }[] } } | null)?.hits
    ?.hits;
  if (Array.isArray(hits)) return hits.map((h) => h._id ?? "").filter(Boolean);
  return [];
}

function renderEmployee(e: CoresignalEmployee): string {
  const activeExp = (e.experience ?? []).find((x) => x.active_experience);
  const company = activeExp?.company_name ?? "";
  const title =
    e.headline ??
    e.job_title ??
    activeExp?.position_title ??
    activeExp?.title ??
    "";
  const location =
    e.location_full ?? e.location_raw_address ?? e.location_country ?? "";
  const pastExp = (e.experience ?? [])
    .filter((x) => !x.active_experience)
    .slice(0, 3)
    .map((x) =>
      [x.position_title ?? x.title, x.company_name].filter(Boolean).join(" at "),
    )
    .filter(Boolean)
    .join("; ");
  const lines = [
    [
      `**${e.full_name ?? e.name ?? "Unknown"}**`,
      title ? `— ${title}` : "",
      company ? `at ${company}` : "",
      location ? `· ${location}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    e.primary_professional_email
      ? `Email: ${e.primary_professional_email}`
      : null,
    pastExp ? `Previously: ${pastExp}` : null,
    e.professional_network_url ?? e.linkedin_url
      ? `LinkedIn: ${e.professional_network_url ?? e.linkedin_url}`
      : null,
    e.id != null ? `Coresignal ID: ${e.id}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

// --- Ladder interpreter (strategy-free) ------------------------------------
// Expands a tier's typed clauses into an Elasticsearch bool query. Holds NO
// strategy — which fields/ops/order/weights to use lives in the secret spec.

const clampInt = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.floor(n)));

/** Trimmed, non-empty values for a clause: a string → [string]; an array →
 *  filtered; anything else → []. */
function valuesOf(args: CoresignalSourceArgs, key?: string): string[] {
  if (!key) return [];
  const raw = (args as unknown as Record<string, unknown>)[key];
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

interface BoolBuckets {
  must: unknown[];
  should: unknown[];
  filter: unknown[];
  must_not: unknown[];
}

function assembleBool(
  clauses: LadderClause[],
  args: CoresignalSourceArgs,
): { bool: Record<string, unknown> } {
  const buckets: BoolBuckets = { must: [], should: [], filter: [], must_not: [] };
  for (const c of clauses) {
    const node = expandClause(c, args);
    if (node != null) buckets[c.bool].push(node);
  }
  const bool: Record<string, unknown> = {};
  (["must", "should", "filter", "must_not"] as const).forEach((k) => {
    if (buckets[k].length) bool[k] = buckets[k];
  });
  // A pure-should bool needs a floor or it matches nothing meaningful.
  if (buckets.should.length && !buckets.must.length && !buckets.filter.length) {
    bool.minimum_should_match = 1;
  }
  return { bool };
}

/** Expand one clause → an ES node, or null when it has no usable input (so a
 *  tier degrades gracefully when, say, `skills` is absent). */
function expandClause(
  c: LadderClause,
  args: CoresignalSourceArgs,
): unknown | null {
  if (c.op === "term") {
    return c.field ? { term: { [c.field]: c.value } } : null;
  }
  if (c.op === "nested") {
    if (!c.path || !c.clauses) return null;
    const inner = assembleBool(c.clauses, args);
    return Object.keys(inner.bool).length
      ? { nested: { path: c.path, query: inner } }
      : null;
  }
  const values = valuesOf(args, c.valuesFrom);
  if (values.length === 0) return null;
  if (c.op === "query_string") {
    const query =
      values.length === 1 ? values[0] : values.map((v) => `"${v}"`).join(" OR ");
    return {
      query_string: {
        query,
        ...(c.fields ? { fields: c.fields } : c.field ? { fields: [c.field] } : {}),
        default_operator: (c.defaultOperator ?? "and").toUpperCase(),
      },
    };
  }
  // match | match_phrase
  if (!c.field) return null;
  const subs = values.map((v) => ({ [c.op]: { [c.field as string]: v } }));
  return subs.length === 1
    ? subs[0]
    : { bool: { should: subs, minimum_should_match: 1 } };
}

/** Build the ES DSL search body for a tier. Exported for unit tests. Returns a
 *  body whose bool is empty when the tier has no usable inputs — callers skip
 *  those rather than search-everything. */
export function buildTierQuery(
  tier: LadderTier,
  args: CoresignalSourceArgs,
): { query: { bool: Record<string, unknown> } } {
  return { query: assembleBool(tier.clauses, args) };
}

export const coresignalAdapter: CoresignalAdapter = {
  provider: "coresignal",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Malformed on purpose: 400 = key works (unbilled), 401/403 = bad key.
      const res = await request(apiKey, "/search/es_dsl", {
        query: { invalid_probe: {} },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Coresignal rejected the API key." };
      }
      const remaining = res.headers.get("x-credits-remaining");
      return {
        ok: true,
        accountLabel: remaining
          ? `Coresignal (${remaining} credits left)`
          : "Coresignal account",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchEmployees(apiKey, args) {
    const clauses: unknown[] = [];
    if (args.name)
      clauses.push({ match: { full_name: { query: args.name, operator: "and" } } });
    if (args.title) clauses.push({ match: { headline: args.title } });
    if (args.company)
      clauses.push({ match: { "experience.company_name": args.company } });
    if (args.location) clauses.push({ match: { location_full: args.location } });
    if (clauses.length === 0) {
      return {
        text: "Provide at least one filter: name, title, company, or location.",
        count: 0,
        truncated: false,
      };
    }
    const ids = extractIds(
      await call<unknown>(apiKey, "/search/es_dsl", {
        query: { bool: { must: clauses } },
      }),
    );
    if (ids.length === 0)
      return { text: "_No profiles found._", count: 0, truncated: false };

    const take = Math.min(args.limit ?? DEFAULT_COLLECT, HARD_COLLECT);
    const collected = await Promise.all(
      ids.slice(0, take).map(async (id) => {
        try {
          return await call<CoresignalEmployee>(apiKey, `/collect/${id}`);
        } catch {
          return { id } as CoresignalEmployee;
        }
      }),
    );
    const blocks: string[] = [];
    for (const e of collected) {
      blocks.push(renderEmployee(e));
      if (blocks.join("\n\n").length > CHAR_CAP) break;
    }
    return {
      text: blocks.join("\n\n"),
      count: collected.length,
      truncated: ids.length > take,
    };
  },

  async collectEmployee(apiKey, idOrShorthand) {
    if (!idOrShorthand) {
      return {
        text: "Provide a Coresignal id or LinkedIn shorthand name.",
        found: false,
      };
    }
    const e = await call<CoresignalEmployee>(
      apiKey,
      `/collect/${encodeURIComponent(idOrShorthand)}`,
    );
    return { text: renderEmployee(e), found: !!(e.full_name ?? e.name) };
  },

  async sourceEmployees(apiKey, args, spec, capRemaining, record) {
    const target = clampInt(args.targetCount ?? spec.defaults.targetCount, 1, 100);
    const maxCollects = clampInt(
      args.maxCollects ?? spec.defaults.maxCollects,
      1,
      HARD_MAX_COLLECTS,
    );
    // Effective ceiling = min(spec/arg budget, the project's remaining cap).
    const ceiling = Math.min(
      clampInt(args.creditBudget ?? spec.defaults.creditBudget, 1, HARD_CREDIT_BUDGET),
      capRemaining ?? Number.POSITIVE_INFINITY,
    );
    if (ceiling < SEARCH_CREDIT_COST) {
      return {
        text: "_Coresignal budget reached for this project — raise its cap on the Shortlist tab to search more._",
        count: 0,
        truncated: false,
        creditsSpent: 0,
      };
    }

    const seen = new Map<
      string,
      { tier: string; weight: number; rank: number }
    >();
    let estSpent = 0;
    const tierLog: string[] = [];

    for (const tier of spec.tiers) {
      if (seen.size >= target) break;
      if (estSpent + SEARCH_CREDIT_COST > ceiling) break;
      const body = buildTierQuery(tier, args);
      if (Object.keys(body.query.bool).length === 0) continue; // no inputs
      let ids: string[] = [];
      try {
        const r = await callClean<unknown>(apiKey, "/search/es_dsl", body);
        estSpent += SEARCH_CREDIT_COST;
        ids = extractIds(r.json);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        if (/\(403\)/.test(msg)) {
          return {
            text:
              "Coresignal returned 403 — the Clean Employee dataset isn't on this workspace's Coresignal plan. " +
              "Use coresignal_search_employees (multi-source) instead, or upgrade the plan.",
            count: 0,
            truncated: false,
            creditsSpent: estSpent,
          };
        }
        tierLog.push(`${tier.name}: error`);
        continue;
      }
      let added = 0;
      ids.forEach((id, i) => {
        if (!seen.has(id)) {
          seen.set(id, { tier: tier.name, weight: tier.weight, rank: i });
          added++;
        }
      });
      tierLog.push(`${tier.name} ${ids.length}↦+${added}`);
    }

    // Rank by tier weight, then in-tier position. Hydrate the top N in budget.
    const ranked = [...seen.entries()].sort(
      (a, b) => b[1].weight - a[1].weight || a[1].rank - b[1].rank,
    );
    const toCollect: string[] = [];
    for (const [id] of ranked) {
      if (toCollect.length >= maxCollects) break;
      if (estSpent + COLLECT_CREDIT_COST > ceiling) break;
      estSpent += COLLECT_CREDIT_COST;
      toCollect.push(id);
    }
    const collected = await Promise.all(
      toCollect.map(async (id) => {
        try {
          const r = await callClean<CoresignalEmployee>(
            apiKey,
            `/collect/${encodeURIComponent(id)}`,
          );
          return r.json;
        } catch {
          return { id } as CoresignalEmployee;
        }
      }),
    );

    if (record && estSpent > 0) {
      await record(estSpent, {
        tiers: tierLog,
        unique: seen.size,
        hydrated: collected.length,
      });
    }

    const blocks: string[] = [];
    for (const e of collected) {
      blocks.push(renderEmployee(e));
      if (blocks.join("\n\n").length > CLEAN_CHAR_CAP) break;
    }
    const header = `_Coresignal ladder — ${
      tierLog.join(" · ") || "no tiers run"
    }. ${seen.size} unique, hydrated ${collected.length}, ~${estSpent} credits._`;
    return {
      text: blocks.length
        ? `${header}\n\n${blocks.join("\n\n")}`
        : `${header}\n\n_No matching profiles._`,
      count: collected.length,
      truncated: seen.size > collected.length,
      creditsSpent: estSpent,
    };
  },
};
