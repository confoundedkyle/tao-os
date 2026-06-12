import "server-only";
import type { ConnectorAdapter } from "./types";

// Recruiterflow ATS/CRM. Auth is an API key (issued by the Recruiterflow
// team) sent in the `RF-Api-Key` header. Endpoints live under
// api.recruiterflow.com/api/external/* and return {data: [...]} envelopes
// with items_per_page/current_page paging. The candidate search endpoint's
// body schema is documented only in an external PDF, so this adapter sticks
// to the list endpoints (page through; filter client-side).
const API = "https://api.recruiterflow.com/api/external";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

export interface RecruiterflowJob {
  id?: number;
  name?: string | null;
  title?: string | null;
  job_status?: { name?: string | null } | null;
  status?: string | null;
  client_company?: { name?: string | null } | null;
  client_company_name?: string | null;
  locations?: { name?: string | null }[] | null;
}

export interface RecruiterflowCandidate {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string[] | null;
  phone_number?: string[] | null;
  contact_number?: string[] | null;
  current_designation?: string | null;
  current_organization?: string | null;
}

export interface RecruiterflowAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { openOnly?: boolean; page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { "RF-Api-Key": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Recruiterflow error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const recruiterflowAdapter: RecruiterflowAdapter = {
  provider: "recruiterflow",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/user/list");
      return { ok: true, accountLabel: "Recruiterflow account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{ data?: RecruiterflowJob[] }>(apiKey, "/job/list", {
      items_per_page: limit,
      current_page: args?.page ?? 1,
      only_open: args?.openOnly ? "true" : undefined,
    });
    const jobs = json.data ?? [];
    const lines = [
      "| Job | Status | Client | Location | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location = (j.locations ?? [])
        .map((l) => l.name)
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${cell(j.name ?? j.title)} | ${cell(
          j.job_status?.name ?? j.status,
        )} | ${cell(j.client_company?.name ?? j.client_company_name)} | ${cell(
          location,
        )} | ${j.id ?? ""} |`,
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

  async listCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{ data?: RecruiterflowCandidate[] }>(
      apiKey,
      "/candidate/list",
      { items_per_page: limit, current_page: args?.page ?? 1 },
    );
    const candidates = json.data ?? [];
    const lines = [
      "| Name | Email | Phone | Title | Company | Candidate ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(c.email?.[0])} | ${cell(
          c.phone_number?.[0] ?? c.contact_number?.[0],
        )} | ${cell(c.current_designation)} | ${cell(
          c.current_organization,
        )} | ${c.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: candidates.length ? lines.join("\n") : "_No candidates._",
      count: candidates.length,
      truncated: truncated || candidates.length === limit,
    };
  },
};
