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

const DEFAULT_COLLECT = 3;
const HARD_COLLECT = 5;
const CHAR_CAP = 12_000;

interface CoresignalExperience {
  company_name?: string | null;
  position_title?: string | null;
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
  const title = e.headline ?? e.job_title ?? activeExp?.position_title ?? "";
  const location =
    e.location_full ?? e.location_raw_address ?? e.location_country ?? "";
  const pastExp = (e.experience ?? [])
    .filter((x) => !x.active_experience)
    .slice(0, 3)
    .map((x) => [x.position_title, x.company_name].filter(Boolean).join(" at "))
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
};
