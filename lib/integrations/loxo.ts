import "server-only";
import type { ConnectorAdapter } from "./types";

// Loxo ATS/CRM (recruiting agencies). The Open API (a paid Loxo feature) uses
// a Bearer key from Settings → API Keys, but every endpoint is scoped by an
// agency slug in the path and no endpoint reveals the slug for a key — so the
// stored credential is the user-pasted pair "agency-slug:api-key" and
// validateApiKey teaches that format on miss. The slug is the subdomain in the
// agency's Loxo URL ({slug}.app.loxo.co).
const API = "https://app.loxo.co/api";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

const CREDENTIAL_HINT =
  'Paste the credential as "agency-slug:api-key" — the slug is the subdomain in your Loxo URL ({slug}.app.loxo.co), and keys are created in Settings → API Keys (Open API access is a paid Loxo feature).';

export interface LoxoPerson {
  id?: number | string;
  name?: string | null;
  current_title?: string | null;
  title?: string | null;
  current_company?: string | null;
  company?: { name?: string | null } | string | null;
  city?: string | null;
  state?: string | null;
  emails?: { value?: string | null }[] | null;
  phones?: { value?: string | null }[] | null;
}

export interface LoxoJob {
  id?: number | string;
  title?: string | null;
  name?: string | null;
  status?: { name?: string | null } | string | null;
  city?: string | null;
  state?: string | null;
  company?: { name?: string | null } | null;
}

export interface LoxoAdapter extends ConnectorAdapter {
  listJobs(
    credential: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchPeople(
    credential: string,
    args: { query: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listJobCandidates(
    credential: string,
    args: { jobId: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function parseCredential(
  credential: string,
): { slug: string; key: string } | null {
  const i = credential.indexOf(":");
  if (i <= 0 || i === credential.length - 1) return null;
  const slug = credential.slice(0, i).trim();
  const key = credential.slice(i + 1).trim();
  if (!slug || !key || /[^a-z0-9-_]/i.test(slug)) return null;
  return { slug, key };
}

async function get<T>(
  credential: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const parsed = parseCredential(credential);
  if (!parsed) throw new Error(`Loxo credential is malformed. ${CREDENTIAL_HINT}`);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(
    `${API}/${parsed.slug}${path}${qs ? `?${qs}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${parsed.key}`,
        Accept: "application/json",
      },
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Loxo error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Loxo list responses vary; accept a bare array or common wrapper keys. */
function unwrap<T>(json: unknown, ...keys: string[]): T[] {
  if (Array.isArray(json)) return json as T[];
  for (const key of keys) {
    const v = (json as Record<string, unknown> | null)?.[key];
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function statusOf(j: LoxoJob): string {
  if (!j.status) return "";
  return typeof j.status === "string" ? j.status : j.status.name ?? "";
}

function companyOf(p: LoxoPerson): string {
  if (p.current_company) return p.current_company;
  if (!p.company) return "";
  return typeof p.company === "string" ? p.company : p.company.name ?? "";
}

function renderPeople(people: LoxoPerson[]): {
  text: string;
  truncated: boolean;
} {
  if (people.length === 0) return { text: "_No people._", truncated: false };
  const lines = [
    "| Name | Title | Company | Location | Email | Person ID |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const p of people) {
    const location = [p.city, p.state].filter(Boolean).join(", ");
    lines.push(
      `| ${cell(p.name)} | ${cell(p.current_title ?? p.title)} | ${cell(
        companyOf(p),
      )} | ${cell(location)} | ${cell(p.emails?.[0]?.value)} | ${
        p.id ?? ""
      } |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const loxoAdapter: LoxoAdapter = {
  provider: "loxo",
  authType: "apikey",

  async validateApiKey(credential) {
    if (!parseCredential(credential)) {
      return { ok: false, message: CREDENTIAL_HINT };
    }
    try {
      await get<unknown>(credential, "/jobs", { per_page: 1 });
      const slug = parseCredential(credential)?.slug;
      return { ok: true, accountLabel: `Loxo (${slug})` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(credential, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<unknown>(credential, "/jobs", {
      per_page: limit,
      query: args?.query,
    });
    const jobs = unwrap<LoxoJob>(json, "jobs", "results").slice(0, limit);
    const lines = [
      "| Job | Status | Company | Location | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location = [j.city, j.state].filter(Boolean).join(", ");
      lines.push(
        `| ${cell(j.title ?? j.name)} | ${cell(statusOf(j))} | ${cell(
          j.company?.name,
        )} | ${cell(location)} | ${j.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || jobs.length === limit,
    };
  },

  async searchPeople(credential, args) {
    if (!args.query) {
      return {
        text: "Provide a search query (name, title, company, or email).",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<unknown>(credential, "/people", {
      query: args.query,
      per_page: limit,
    });
    const people = unwrap<LoxoPerson>(json, "people", "results").slice(0, limit);
    const rendered = renderPeople(people);
    return {
      text: rendered.text,
      count: people.length,
      truncated: rendered.truncated || people.length === limit,
    };
  },

  async listJobCandidates(credential, args) {
    if (!args.jobId) {
      return {
        text: "Provide a jobId (from loxo_list_jobs).",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<unknown>(
      credential,
      `/jobs/${encodeURIComponent(args.jobId)}/candidates`,
      { per_page: limit },
    );
    // Candidate entries wrap the person; some responses return people directly.
    const entries = unwrap<{ person?: LoxoPerson } & LoxoPerson>(
      json,
      "candidates",
      "results",
      "people",
    ).slice(0, limit);
    const people = entries.map((e) => e.person ?? e);
    const rendered = renderPeople(people);
    return {
      text: rendered.text,
      count: people.length,
      truncated: rendered.truncated || people.length === limit,
    };
  },
};
