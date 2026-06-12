import "server-only";
import type { ConnectorAdapter } from "./types";

// SmartRecruiters ATS. Auth is a customer API key (SmartRecruiters: Settings /
// Administration → Apps & Integrations → API → API Keys) sent as an
// X-SmartToken header against the global api.smartrecruiters.com host — no
// per-account subdomain. Jobs and candidates both return { totalFound,
// content: [...] } envelopes; candidates support q (name/email search) and
// jobId (one role's pipeline) filters with limit paging.
const API = "https://api.smartrecruiters.com";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100; // SmartRecruiters page max
const CHAR_CAP = 12_000;

export interface SmartRecruitersJob {
  id?: string;
  title?: string | null;
  refNumber?: string | null;
  status?: string | null;
  department?: { label?: string | null } | null;
  location?: {
    city?: string | null;
    country?: string | null;
  } | null;
}

export interface SmartRecruitersCandidate {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  location?: { city?: string | null; country?: string | null } | null;
  primaryAssignment?: {
    job?: { id?: string; title?: string | null } | null;
    status?: string | null;
    subStatus?: string | null;
  } | null;
}

export interface SmartRecruitersAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { status?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { query?: string; jobId?: string; limit?: number },
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
    headers: { "X-SmartToken": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`SmartRecruiters error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const smartrecruitersAdapter: SmartRecruitersAdapter = {
  provider: "smartrecruiters",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/jobs", { limit: 1 });
      // Company name makes a friendlier label, but the key may not carry the
      // configuration scope — fall back to a generic label, never fail here.
      let label = "SmartRecruiters";
      try {
        const company = await get<{ name?: string }>(
          apiKey,
          "/configuration/company",
        );
        if (company.name) label = `SmartRecruiters (${company.name})`;
      } catch {
        // keep generic label
      }
      return { ok: true, accountLabel: label };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      totalFound?: number;
      content?: SmartRecruitersJob[];
    }>(apiKey, "/jobs", { status: args?.status, limit });
    const jobs = json.content ?? [];
    const lines = [
      "| Job | Status | Department | Location | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location = [j.location?.city, j.location?.country]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${cell(j.title)} | ${cell(j.status)} | ${cell(
          j.department?.label,
        )} | ${cell(location)} | ${cell(j.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || (json.totalFound ?? jobs.length) > jobs.length,
    };
  },

  async listCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      totalFound?: number;
      content?: SmartRecruitersCandidate[];
    }>(apiKey, "/candidates", {
      q: args?.query,
      jobId: args?.jobId,
      limit,
    });
    const candidates = json.content ?? [];
    const lines = [
      "| Name | Email | Phone | Location | Stage | Job | Candidate ID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
      const location = [c.location?.city, c.location?.country]
        .filter(Boolean)
        .join(", ");
      const stage = [c.primaryAssignment?.status, c.primaryAssignment?.subStatus]
        .filter(Boolean)
        .join(" / ");
      lines.push(
        `| ${cell(name)} | ${cell(c.email)} | ${cell(c.phoneNumber)} | ${cell(
          location,
        )} | ${cell(stage)} | ${cell(c.primaryAssignment?.job?.title)} | ${cell(
          c.id,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: candidates.length ? lines.join("\n") : "_No candidates._",
      count: candidates.length,
      truncated:
        truncated || (json.totalFound ?? candidates.length) > candidates.length,
    };
  },
};
