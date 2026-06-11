import "server-only";
import type { ConnectorAdapter } from "./types";

// Ashby ATS. Auth is an API key (Settings → API in Ashby), sent as HTTP Basic
// with the key as the username and an empty password. The API is POST-only with
// JSON bodies; list endpoints paginate with { cursor, moreDataAvailable }.
const API = "https://api.ashbyhq.com";

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 200;
const CHAR_CAP = 12_000;

export interface AshbyCandidate {
  id: string;
  name?: string;
  primaryEmailAddress?: { value?: string } | null;
  emailAddresses?: { value: string }[];
  location?: { locationSummary?: string } | string | null;
  position?: string | null;
  company?: string | null;
  school?: string | null;
}

export interface AshbyJob {
  id: string;
  title?: string;
  status?: string;
  locationName?: string | null;
}

export interface AshbyAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { openOnly?: boolean },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    apiKey: string,
    args: { query: string },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

interface AshbyResponse<T> {
  success: boolean;
  results?: T;
  errors?: unknown;
  moreDataAvailable?: boolean;
  nextCursor?: string;
}

async function call<T>(
  apiKey: string,
  resource: string,
  body: Record<string, unknown>,
): Promise<AshbyResponse<T>> {
  const res = await fetch(`${API}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ashby ${resource} failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as AshbyResponse<T>;
  if (!json.success) {
    throw new Error(`Ashby ${resource} error: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

function locationOf(c: AshbyCandidate): string {
  if (!c.location) return "";
  if (typeof c.location === "string") return c.location;
  return c.location.locationSummary ?? "";
}

function emailOf(c: AshbyCandidate): string {
  return (
    c.primaryEmailAddress?.value ?? c.emailAddresses?.[0]?.value ?? ""
  );
}

function renderCandidates(candidates: AshbyCandidate[]): {
  text: string;
  truncated: boolean;
} {
  if (candidates.length === 0)
    return { text: "_No candidates._", truncated: false };
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    "| Name | Email | Location | Company | Title |",
    "| --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const c of candidates) {
    lines.push(
      `| ${cell(c.name ?? "")} | ${cell(emailOf(c))} | ${cell(
        locationOf(c),
      )} | ${cell(c.company ?? "")} | ${cell(c.position ?? "")} |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

async function fetchCandidatePage(
  apiKey: string,
  resource: string,
  baseBody: Record<string, unknown>,
  target: number,
): Promise<{ candidates: AshbyCandidate[]; truncated: boolean }> {
  const candidates: AshbyCandidate[] = [];
  let cursor: string | undefined;
  let more = false;
  do {
    const json = await call<AshbyCandidate[]>(apiKey, resource, {
      ...baseBody,
      limit: Math.min(100, target - candidates.length),
      ...(cursor ? { cursor } : {}),
    });
    candidates.push(...(json.results ?? []));
    more = !!json.moreDataAvailable;
    cursor = json.nextCursor;
  } while (cursor && more && candidates.length < target);
  return { candidates: candidates.slice(0, target), truncated: more };
}

export const ashbyAdapter: AshbyAdapter = {
  provider: "ashby",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Cheap authenticated call; any 2xx success means the key works.
      await call<unknown>(apiKey, "job.list", { limit: 1 });
      return { ok: true, accountLabel: "Ashby workspace" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const json = await call<AshbyJob[]>(apiKey, "job.list", {});
    let jobs = json.results ?? [];
    if (args?.openOnly) jobs = jobs.filter((j) => j.status === "Open");
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const lines = ["| Title | Status | Location | Job ID |", "| --- | --- | --- | --- |"];
    let truncated = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(j.title ?? "")} | ${cell(j.status ?? "")} | ${cell(
          j.locationName ?? "",
        )} | ${j.id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || !!json.moreDataAvailable,
    };
  },

  async listCandidates(apiKey, args) {
    const target = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const { candidates, truncated } = await fetchCandidatePage(
      apiKey,
      "candidate.list",
      {},
      target,
    );
    const rendered = renderCandidates(candidates);
    return {
      text: rendered.text,
      count: candidates.length,
      truncated: truncated || rendered.truncated,
    };
  },

  async searchCandidates(apiKey, { query }) {
    // candidate.search matches on name/email.
    const json = await call<AshbyCandidate[]>(apiKey, "candidate.search", {
      name: query,
      email: query,
    });
    const candidates = json.results ?? [];
    const rendered = renderCandidates(candidates);
    return {
      text: rendered.text,
      count: candidates.length,
      truncated: rendered.truncated,
    };
  },
};
