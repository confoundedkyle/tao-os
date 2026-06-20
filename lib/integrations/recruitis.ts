import "server-only";
import type { ConnectorAdapter } from "./types";

// Recruitis (recruitis.io) — recruitment ATS + CRM popular in CZ/SK. Auth is a
// personal/firm API token (Recruitis: Settings → API → generate a token with
// the api.*.read scopes) sent as a Bearer header. Every response is wrapped in
// a { payload, meta } envelope where meta carries paging (entries_total) and a
// result code. Jobs come from /jobs; the candidate pipeline is /answers — an
// "answer" is one candidate's application to a job, carrying the candidate's
// contact details plus the current pipeline stage. Paging is page-based with a
// hard cap of 50 per request (the API rejects more).
const API = "https://app.recruitis.io/api2";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 50; // Recruitis rejects limit > 50
const CHAR_CAP = 12_000;

interface Meta {
  entries_total?: number;
}

interface Employee {
  name?: string | null;
  surname?: string | null;
}

interface Address {
  city?: string | null;
  region?: string | null;
  state?: string | null;
}

interface Salary {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  unit?: string | null;
}

export interface RecruitisJob {
  job_id?: number;
  title?: string | null;
  active?: boolean;
  draft?: boolean;
  addresses?: Address[] | null;
  salary?: Salary | null;
  contact?: { employee?: Employee | null } | null;
}

export interface RecruitisAnswer {
  answer_id?: number;
  candidate_id?: number;
  job_id?: number;
  job_title?: string | null;
  candidate_name?: string | null;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  date_created?: string | null;
  // Pipeline stage: the API returns either a numeric id or a { id, name } object.
  flow?: number | { id?: number; name?: string | null } | null;
}

export interface RecruitisAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { limit?: number; page?: number; activeOnly?: boolean },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { limit?: number; page?: number; jobId?: string },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<{ payload: T; meta: Meta }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json().catch(() => null)) as
    | { payload?: T; meta?: Meta & { message?: string } }
    | null;
  if (!res.ok) {
    const detail = json?.meta?.message ?? res.statusText;
    throw new Error(`Recruitis error (${res.status}): ${detail}`);
  }
  return { payload: (json?.payload ?? ([] as unknown)) as T, meta: json?.meta ?? {} };
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function jobStatus(j: RecruitisJob): string {
  if (j.draft) return "draft";
  if (j.active) return "active";
  return "inactive";
}

function jobLocation(j: RecruitisJob): string {
  const a = j.addresses?.[0];
  if (!a) return "";
  return [a.city, a.region ?? a.state].filter(Boolean).join(", ");
}

function jobSalary(j: RecruitisJob): string {
  const s = j.salary;
  if (!s || (s.min == null && s.max == null)) return "";
  const range =
    s.min != null && s.max != null
      ? `${s.min}–${s.max}`
      : String(s.min ?? s.max);
  return [range, s.currency, s.unit && `/${s.unit}`]
    .filter(Boolean)
    .join(" ")
    .replace(" /", "/");
}

function stageLabel(flow: RecruitisAnswer["flow"]): string {
  if (flow == null) return "";
  if (typeof flow === "object") return cell(flow.name ?? flow.id ?? "");
  return String(flow);
}

export const recruitisAdapter: RecruitisAdapter = {
  provider: "recruitis",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const { payload } = await get<{
        fullname?: string | null;
        email?: string | null;
      }>(apiKey, "/me");
      const label = payload?.fullname ?? payload?.email;
      return { ok: true, accountLabel: label ? `Recruitis (${label})` : "Recruitis" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const page = args?.page ?? 1;
    const { payload, meta } = await get<RecruitisJob[]>(apiKey, "/jobs", {
      limit,
      page,
      activity_state: args?.activeOnly ? 1 : undefined,
    });
    const jobs = Array.isArray(payload) ? payload : [];
    const lines = [
      "| Job | Status | Location | Salary | Recruiter | Job ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const e = j.contact?.employee;
      const recruiter = e ? [e.name, e.surname].filter(Boolean).join(" ") : "";
      lines.push(
        `| ${cell(j.title)} | ${jobStatus(j)} | ${cell(jobLocation(j))} | ${cell(
          jobSalary(j),
        )} | ${cell(recruiter)} | ${j.job_id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || page * limit < (meta.entries_total ?? 0),
    };
  },

  async listCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const page = args?.page ?? 1;
    // The candidate pipeline lives in /answers — one row per application, with
    // the candidate's contact details and current pipeline stage.
    const { payload, meta } = await get<RecruitisAnswer[]>(apiKey, "/answers", {
      limit,
      page,
      "job_id[]": args?.jobId,
    });
    const answers = Array.isArray(payload) ? payload : [];
    const lines = [
      "| Name | Email | Phone | Job | Stage | Applied | Candidate ID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const a of answers) {
      lines.push(
        `| ${cell(a.candidate_name)} | ${cell(a.candidate_email)} | ${cell(
          a.candidate_phone,
        )} | ${cell(a.job_title)} | ${cell(stageLabel(a.flow))} | ${cell(
          a.date_created,
        )} | ${a.candidate_id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: answers.length ? lines.join("\n") : "_No candidates._",
      count: answers.length,
      truncated: truncated || page * limit < (meta.entries_total ?? 0),
    };
  },
};
