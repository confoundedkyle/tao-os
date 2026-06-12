import "server-only";
import type { ConnectorAdapter } from "./types";

// Teamtailor ATS. Auth is an API key (Settings → API keys; needs Admin scope
// to read candidates) sent as `Authorization: Token token=<key>`, plus a
// pinned X-Api-Version header. The API is JSON:API ({data, included, links})
// and accounts live on one of two stacks — EU (api.teamtailor.com) or NA
// (api.na.teamtailor.com) — which the key doesn't reveal, so requests try EU
// first and fall back to NA on an auth-shaped failure. Page size caps at 30.
const HOSTS = [
  "https://api.teamtailor.com/v1",
  "https://api.na.teamtailor.com/v1",
];
const API_VERSION = "20161108";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 30; // Teamtailor page[size] max
const CHAR_CAP = 12_000;

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { id?: string; type?: string } | null }
  >;
}

interface JsonApiList {
  data?: JsonApiResource[];
  included?: JsonApiResource[];
  links?: { next?: string | null };
}

export interface TeamtailorAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { status?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { email?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listJobApplications(
    apiKey: string,
    args: { jobId: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function getFromHost<T>(
  host: string,
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${host}${path}${qs ? `?${qs}` : ""}`, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      "X-Api-Version": API_VERSION,
      Accept: "application/vnd.api+json",
    },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, json };
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  let last: { status: number; json: unknown } | null = null;
  for (const host of HOSTS) {
    const res = await getFromHost<T>(host, apiKey, path, params);
    if (res.ok) return res.json as T;
    last = res;
    // Only an auth/not-found-shaped failure suggests the other stack.
    if (![401, 403, 404].includes(res.status)) break;
  }
  const detail =
    (last?.json as { errors?: { detail?: string }[] } | null)?.errors?.[0]
      ?.detail ?? `status ${last?.status}`;
  throw new Error(`Teamtailor error: ${detail}`);
}

function attr(r: JsonApiResource | undefined, key: string): string {
  const v = r?.attributes?.[key];
  return v == null ? "" : String(v);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function candidateName(c: JsonApiResource | undefined): string {
  return [attr(c, "first-name"), attr(c, "last-name")]
    .filter(Boolean)
    .join(" ");
}

function renderCandidates(candidates: JsonApiResource[]): {
  text: string;
  truncated: boolean;
} {
  if (candidates.length === 0)
    return { text: "_No candidates._", truncated: false };
  const lines = [
    "| Name | Email | Phone | Pitch | Candidate ID |",
    "| --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const c of candidates) {
    lines.push(
      `| ${cell(candidateName(c))} | ${cell(attr(c, "email"))} | ${cell(
        attr(c, "phone"),
      )} | ${cell(attr(c, "pitch").slice(0, 120))} | ${c.id} |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const teamtailorAdapter: TeamtailorAdapter = {
  provider: "teamtailor",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const json = await get<{ data?: JsonApiResource }>(apiKey, "/company");
      const name = json.data?.attributes?.name;
      return {
        ok: true,
        accountLabel: typeof name === "string" ? name : "Teamtailor company",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<JsonApiList>(apiKey, "/jobs", {
      "filter[status]": args?.status,
      "page[size]": limit,
    });
    const jobs = json.data ?? [];
    const lines = [
      "| Job | Status | Remote | Job ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(attr(j, "title"))} | ${cell(
          attr(j, "human-status") || attr(j, "status"),
        )} | ${cell(attr(j, "remote-status"))} | ${j.id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || !!json.links?.next,
    };
  },

  async listCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<JsonApiList>(apiKey, "/candidates", {
      "filter[email]": args?.email,
      "page[size]": limit,
    });
    const candidates = json.data ?? [];
    const rendered = renderCandidates(candidates);
    return {
      text: rendered.text,
      count: candidates.length,
      truncated: rendered.truncated || !!json.links?.next,
    };
  },

  async listJobApplications(apiKey, args) {
    if (!args.jobId) {
      return {
        text: "Provide a jobId (from teamtailor_list_jobs).",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<JsonApiList>(apiKey, "/job-applications", {
      "filter[job-id]": args.jobId,
      include: "candidate",
      "page[size]": limit,
    });
    const included = new Map(
      (json.included ?? [])
        .filter((r) => r.type === "candidates")
        .map((r) => [r.id, r]),
    );
    const candidates = (json.data ?? [])
      .map((app) => included.get(app.relationships?.candidate?.data?.id ?? ""))
      .filter((c): c is JsonApiResource => !!c);
    const rendered = renderCandidates(candidates);
    return {
      text: rendered.text,
      count: candidates.length,
      truncated: rendered.truncated || !!json.links?.next,
    };
  },
};
