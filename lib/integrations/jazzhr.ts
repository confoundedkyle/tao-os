import "server-only";
import type { ConnectorAdapter } from "./types";

// JazzHR (the legacy Resumator API). Auth is an API key passed as the
// `apikey` query param (JazzHR: Settings → Integrations → API key) — same
// scheme as Hunter. Filters are path segments (/jobs/status/open,
// /applicants/job_id/{id}), pagination is /page/N at 100 rows per page, and
// list responses return a bare array. Applicant list rows omit the email
// address — it only appears on the applicant detail view, hence getApplicant.
const API = "https://api.resumatorapi.com/v1";

const PAGE_SIZE = 100;
const CHAR_CAP = 12_000;

export interface JazzhrJob {
  id?: string;
  title?: string | null;
  status?: string | null;
  department?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface JazzhrApplicant {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  prospect_phone?: string | null;
  job_title?: string | null;
  apply_date?: string | null;
  address?: string | null;
}

export interface JazzhrAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { status?: string; page?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listApplicants(
    apiKey: string,
    args?: { jobId?: string; name?: string; page?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  getApplicant(
    apiKey: string,
    applicantId: string,
  ): Promise<{ text: string; found: boolean }>;
}

async function get<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(
    `${API}${path}?apikey=${encodeURIComponent(apiKey)}`,
    { headers: { Accept: "application/json" } },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ?? res.statusText;
    throw new Error(`JazzHR error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Detail endpoints return an object; list endpoints a bare array. */
function asList<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  return json ? [json as T] : [];
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function nameOf(a: JazzhrApplicant): string {
  return [a.first_name, a.last_name].filter(Boolean).join(" ");
}

export const jazzhrAdapter: JazzhrAdapter = {
  provider: "jazzhr",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/jobs/page/1");
      return { ok: true, accountLabel: "JazzHR account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    let path = "/jobs";
    if (args?.status) path += `/status/${seg(args.status)}`;
    path += `/page/${args?.page ?? 1}`;
    const jobs = asList<JazzhrJob>(await get<unknown>(apiKey, path));
    const lines = [
      "| Job | Status | Department | Location | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location = [j.city, j.state].filter(Boolean).join(", ");
      lines.push(
        `| ${cell(j.title)} | ${cell(j.status)} | ${cell(j.department)} | ${cell(
          location,
        )} | ${cell(j.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || jobs.length === PAGE_SIZE,
    };
  },

  async listApplicants(apiKey, args) {
    let path = "/applicants";
    if (args?.jobId) path += `/job_id/${seg(args.jobId)}`;
    if (args?.name) path += `/name/${seg(args.name)}`;
    path += `/page/${args?.page ?? 1}`;
    const applicants = asList<JazzhrApplicant>(await get<unknown>(apiKey, path));
    const lines = [
      "| Name | Phone | Applied for | Apply date | Applicant ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const a of applicants) {
      lines.push(
        `| ${cell(nameOf(a))} | ${cell(a.prospect_phone ?? a.phone)} | ${cell(
          a.job_title,
        )} | ${cell(a.apply_date)} | ${cell(a.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: applicants.length ? lines.join("\n") : "_No applicants._",
      count: applicants.length,
      truncated: truncated || applicants.length === PAGE_SIZE,
    };
  },

  async getApplicant(apiKey, applicantId) {
    if (!applicantId) {
      return {
        text: "Provide an applicantId (from jazzhr_list_applicants).",
        found: false,
      };
    }
    const a = await get<JazzhrApplicant>(
      apiKey,
      `/applicants/${seg(applicantId)}`,
    );
    if (!a?.id && !a?.first_name) {
      return { text: "No applicant found for that id.", found: false };
    }
    const lines = [
      `**${nameOf(a) || "Unknown"}**${a.job_title ? ` — applied for ${a.job_title}` : ""}`,
      a.email ? `Email: ${a.email}` : null,
      a.phone ?? a.prospect_phone
        ? `Phone: ${a.phone ?? a.prospect_phone}`
        : null,
      a.address ? `Address: ${a.address}` : null,
      a.apply_date ? `Applied: ${a.apply_date}` : null,
    ].filter(Boolean);
    return { text: lines.join("\n"), found: true };
  },
};
