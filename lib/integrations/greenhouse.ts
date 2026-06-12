import "server-only";
import type { ConnectorAdapter } from "./types";

// Greenhouse ATS (Harvest API). Auth is an API key (Configure → Dev Center →
// API Credential Management in Greenhouse) sent as HTTP Basic with the key as
// the username and an empty password — same scheme as Ashby. Reads need no
// On-Behalf-Of header (writes do, but this adapter is read-only). Lists
// paginate with page/per_page; a batch shorter than per_page is the last one.
const API = "https://harvest.greenhouse.io/v1";

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 200;
const PAGE_SIZE = 100;
const CHAR_CAP = 12_000;

export interface GreenhouseJob {
  id: number;
  name?: string | null;
  status?: string | null;
  departments?: { name?: string | null }[] | null;
  offices?: { name?: string | null }[] | null;
}

export interface GreenhouseCandidate {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  email_addresses?: { value?: string | null }[] | null;
  phone_numbers?: { value?: string | null }[] | null;
  addresses?: { value?: string | null }[] | null;
  applications?:
    | {
        jobs?: { name?: string | null }[] | null;
        status?: string | null;
        current_stage?: { name?: string | null } | null;
      }[]
    | null;
}

export interface GreenhouseAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { openOnly?: boolean },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { jobId?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    apiKey: string,
    args: { email: string },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
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
    headers: { Authorization: authHeader(apiKey), Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { errors?: { message?: string }[] } | null)?.errors?.[0]
        ?.message ??
      res.statusText;
    throw new Error(`Greenhouse error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function names(list: { name?: string | null }[] | null | undefined): string {
  return (list ?? [])
    .map((x) => x.name)
    .filter(Boolean)
    .join(", ");
}

function candidateRow(c: GreenhouseCandidate): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  const email = c.email_addresses?.[0]?.value ?? "";
  const app = c.applications?.[0];
  const job = app?.jobs?.[0]?.name ?? "";
  const stage = app?.current_stage?.name ?? "";
  return `| ${cell(name)} | ${cell(email)} | ${cell(c.company)} | ${cell(
    c.title,
  )} | ${cell(job)} | ${cell(stage)} | ${c.id} |`;
}

function renderCandidates(candidates: GreenhouseCandidate[]): {
  text: string;
  truncated: boolean;
} {
  if (candidates.length === 0)
    return { text: "_No candidates._", truncated: false };
  const lines = [
    "| Name | Email | Company | Title | Job | Stage | Candidate ID |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const c of candidates) {
    lines.push(candidateRow(c));
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

/** Pages through a Harvest list endpoint until `target` items are collected. */
async function fetchPages<T>(
  apiKey: string,
  path: string,
  baseParams: Record<string, string | number | undefined>,
  target: number,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = 1;
  let lastBatch = 0;
  const perPage = Math.min(PAGE_SIZE, target);
  do {
    const batch = await get<T[]>(apiKey, path, {
      ...baseParams,
      page,
      per_page: perPage,
    });
    const list = Array.isArray(batch) ? batch : [];
    items.push(...list);
    lastBatch = list.length;
    page += 1;
  } while (lastBatch === perPage && items.length < target);
  return {
    items: items.slice(0, target),
    truncated: items.length > target || lastBatch === perPage,
  };
}

export const greenhouseAdapter: GreenhouseAdapter = {
  provider: "greenhouse",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Cheap authenticated call; any 2xx means the key works for reads.
      await get<unknown>(apiKey, "/jobs", { per_page: 1 });
      return { ok: true, accountLabel: "Greenhouse account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const { items, truncated } = await fetchPages<GreenhouseJob>(
      apiKey,
      "/jobs",
      {},
      HARD_LIMIT,
    );
    const jobs = args?.openOnly
      ? items.filter((j) => j.status === "open")
      : items;
    const lines = [
      "| Job | Status | Department | Office | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let capped = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(j.name)} | ${cell(j.status)} | ${cell(
          names(j.departments),
        )} | ${cell(names(j.offices))} | ${j.id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        capped = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: capped || truncated,
    };
  },

  async listCandidates(apiKey, args) {
    const target = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const { items, truncated } = await fetchPages<GreenhouseCandidate>(
      apiKey,
      "/candidates",
      { job_id: args?.jobId },
      target,
    );
    const rendered = renderCandidates(items);
    return {
      text: rendered.text,
      count: items.length,
      truncated: truncated || rendered.truncated,
    };
  },

  async searchCandidates(apiKey, { email }) {
    if (!email) {
      return {
        text: "Provide an email address to search for.",
        count: 0,
        truncated: false,
      };
    }
    const results = await get<GreenhouseCandidate[]>(apiKey, "/candidates", {
      email,
    });
    const list = Array.isArray(results) ? results : [];
    const rendered = renderCandidates(list);
    return {
      text: rendered.text,
      count: list.length,
      truncated: rendered.truncated,
    };
  },
};
