import "server-only";
import type { ConnectorAdapter } from "./types";

// Manatal ATS (Open API v3). Auth is a token issued by Manatal's support team
// (API access is plan-gated), sent as `Authorization: Token <key>`. Endpoints
// are Django-style: filter params on list endpoints (the candidate list IS the
// search), page/page_size pagination, {count, next, results} envelopes. A
// job's pipeline comes from /jobs/{id}/matches/, which returns candidate ids
// and stage only — listJobCandidates hydrates each candidate so one tool call
// yields a readable pipeline.
const API = "https://api.manatal.com/open/v3";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const MATCH_HYDRATE_CAP = 25;
const CHAR_CAP = 12_000;

interface Paginated<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

export interface ManatalJob {
  id?: number;
  position_name?: string | null;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  is_remote?: boolean | null;
}

export interface ManatalCandidate {
  id?: number;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  current_position?: string | null;
  current_company?: string | null;
  candidate_location?: string | null;
}

interface ManatalMatch {
  candidate?: number | null;
  job_pipeline_stage?: { name?: string | null } | null;
  is_active?: boolean | null;
}

export interface ManatalAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { positionName?: string; status?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    apiKey: string,
    args?: {
      fullName?: string;
      email?: string;
      company?: string;
      position?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listJobCandidates(
    apiKey: string,
    args: { jobId: string; limit?: number },
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
    headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { detail?: string } | null)?.detail ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`Manatal error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderCandidates(
  candidates: (ManatalCandidate & { stage?: string })[],
  withStage: boolean,
): { text: string; truncated: boolean } {
  if (candidates.length === 0)
    return { text: "_No candidates._", truncated: false };
  const header = withStage
    ? "| Name | Email | Phone | Title | Company | Stage | Candidate ID |"
    : "| Name | Email | Phone | Title | Company | Location | Candidate ID |";
  const lines = [header, header.replace(/[^|]+/g, " --- ")];
  let truncated = false;
  for (const c of candidates) {
    const tail = withStage ? c.stage : c.candidate_location;
    lines.push(
      `| ${cell(c.full_name)} | ${cell(c.email)} | ${cell(
        c.phone_number,
      )} | ${cell(c.current_position)} | ${cell(c.current_company)} | ${cell(
        tail,
      )} | ${c.id ?? ""} |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const manatalAdapter: ManatalAdapter = {
  provider: "manatal",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/jobs/", { page_size: 1 });
      return { ok: true, accountLabel: "Manatal account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paginated<ManatalJob>>(apiKey, "/jobs/", {
      page_size: limit,
      position_name: args?.positionName,
      status: args?.status,
    });
    const jobs = json.results ?? [];
    const lines = [
      "| Job | Status | Location | Job ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location =
        [j.city, j.state].filter(Boolean).join(", ") +
        (j.is_remote ? " (remote)" : "");
      lines.push(
        `| ${cell(j.position_name)} | ${cell(j.status)} | ${cell(
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
      truncated: truncated || !!json.next,
    };
  },

  async searchCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paginated<ManatalCandidate>>(apiKey, "/candidates/", {
      page_size: limit,
      full_name: args?.fullName,
      email: args?.email,
      current_company: args?.company,
      current_position: args?.position,
    });
    const candidates = json.results ?? [];
    const rendered = renderCandidates(candidates, false);
    return {
      text: rendered.text,
      count: candidates.length,
      truncated: rendered.truncated || !!json.next,
    };
  },

  async listJobCandidates(apiKey, args) {
    if (!args.jobId) {
      return {
        text: "Provide a jobId (from manatal_list_jobs).",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MATCH_HYDRATE_CAP);
    const json = await get<Paginated<ManatalMatch>>(
      apiKey,
      `/jobs/${encodeURIComponent(args.jobId)}/matches/`,
      { page_size: limit },
    );
    const matches = (json.results ?? []).slice(0, limit);
    // Matches carry only candidate ids — hydrate so the table has names.
    const hydrated = await Promise.all(
      matches.map(async (m) => {
        const stage = m.job_pipeline_stage?.name ?? "";
        if (!m.candidate) return { stage } as ManatalCandidate & { stage: string };
        try {
          const c = await get<ManatalCandidate>(
            apiKey,
            `/candidates/${m.candidate}/`,
          );
          return { ...c, stage };
        } catch {
          return { id: m.candidate, stage } as ManatalCandidate & {
            stage: string;
          };
        }
      }),
    );
    const rendered = renderCandidates(hydrated, true);
    return {
      text: rendered.text,
      count: hydrated.length,
      truncated: rendered.truncated || !!json.next,
    };
  },
};
