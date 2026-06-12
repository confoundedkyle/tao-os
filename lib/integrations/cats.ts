import "server-only";
import type { ConnectorAdapter } from "./types";

// CATS ATS (API v3). Auth is an account API key (CATS: Administration →
// Settings → API Keys) sent as an "Authorization: Token <key>" header against
// the global api.catsone.com host. List responses use a HAL envelope
// ({ count, total, _embedded: { jobs | candidates } }) with page/per_page
// paging (max 100). Candidate search is a separate endpoint
// (/candidates/search?query=) that matches names and emails.
const API = "https://api.catsone.com/v3";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100; // CATS per_page max
const CHAR_CAP = 12_000;

export interface CatsJob {
  id?: number;
  title?: string | null;
  city?: string | null;
  state?: string | null;
  country_code?: string | null;
  date_created?: string | null;
}

export interface CatsCandidate {
  id?: number;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  emails?: { primary?: string | null; secondary?: string | null } | null;
  phones?: {
    cell?: string | null;
    home?: string | null;
    work?: string | null;
  } | null;
}

export interface CatsAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { query?: string; page?: number; limit?: number },
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
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`CATS error (${res.status}): ${detail}`);
  }
  return json as T;
}

interface HalList<K extends string, T> {
  count?: number;
  total?: number;
  _embedded?: Partial<Record<K, T[]>>;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const catsAdapter: CatsAdapter = {
  provider: "cats",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/jobs", { per_page: 1 });
      return { ok: true, accountLabel: "CATS" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<HalList<"jobs", CatsJob>>(apiKey, "/jobs", {
      page: args?.page,
      per_page: limit,
    });
    const jobs = json._embedded?.jobs ?? [];
    const lines = [
      "| Job | Location | Created | Job ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const location = [j.city, j.state, j.country_code]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${cell(j.title)} | ${cell(location)} | ${cell(
          j.date_created?.slice(0, 10),
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
      truncated: truncated || (json.total ?? jobs.length) > jobs.length,
    };
  },

  async listCandidates(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const path = args?.query ? "/candidates/search" : "/candidates";
    const json = await get<HalList<"candidates", CatsCandidate>>(
      apiKey,
      path,
      {
        query: args?.query,
        page: args?.page,
        per_page: limit,
      },
    );
    const candidates = json._embedded?.candidates ?? [];
    const lines = [
      "| Name | Email | Phone | Title | Candidate ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      const phone = c.phones?.cell || c.phones?.work || c.phones?.home;
      lines.push(
        `| ${cell(name)} | ${cell(c.emails?.primary)} | ${cell(phone)} | ${cell(
          c.title,
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
      truncated:
        truncated || (json.total ?? candidates.length) > candidates.length,
    };
  },
};
