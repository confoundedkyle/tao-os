import "server-only";
import type { ConnectorAdapter } from "./types";

// Bright Data. Auth is an API token sent as a Bearer header. Used to enrich
// profiles with public web data via the Web Scraper API's LinkedIn datasets:
// collect people profiles or company pages by URL. Scrapes run server-side at
// Bright Data and can take minutes — we call the synchronous /scrape endpoint
// with a client timeout, and when a job outlives it (or Bright Data answers
// with a snapshot id) the caller retrieves results later via getSnapshot.
// Results are retained for 16 days. Each collected record is billed.
const API = "https://api.brightdata.com";

const PROFILE_DATASET = "gd_l1viktl72bvl7bjuj0"; // LinkedIn people profiles
const COMPANY_DATASET = "gd_l1vikfnt1wgvvqz95w"; // LinkedIn company pages

const MAX_URLS = 5;
const SCRAPE_TIMEOUT_MS = 110_000;
const CHAR_CAP = 12_000;
const ABOUT_CAP = 300;

export interface BrightDataAdapter extends ConnectorAdapter {
  scrapeLinkedinProfiles(
    apiKey: string,
    args: { urls: string[] },
  ): Promise<{ text: string; count: number; pending: boolean }>;
  scrapeLinkedinCompanies(
    apiKey: string,
    args: { urls: string[] },
  ): Promise<{ text: string; count: number; pending: boolean }>;
  getSnapshot(
    apiKey: string,
    snapshotId: string,
  ): Promise<{ text: string; count: number; pending: boolean }>;
}

async function call<T>(
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`Bright Data error (${res.status}): ${detail}`);
  }
  return json as T;
}

interface ProfileRecord {
  url?: string | null;
  input_url?: string | null;
  name?: string | null;
  position?: string | null;
  about?: string | null;
  city?: string | null;
  current_company?: { name?: string | null } | null;
  experience?:
    | { title?: string | null; company?: string | null }[]
    | null;
}

interface CompanyRecord {
  url?: string | null;
  name?: string | null;
  about?: string | null;
  industries?: string | string[] | null;
  company_size?: string | null;
  headquarters?: string | null;
  website?: string | null;
  founded?: number | string | null;
}

function clip(s: string, cap: number): string {
  return s.length > cap ? `${s.slice(0, cap)}…` : s;
}

function isProfile(r: ProfileRecord | CompanyRecord): r is ProfileRecord {
  return "current_company" in r || "experience" in r || "position" in r;
}

function renderProfile(r: ProfileRecord): string {
  const header = [
    `**${r.name ?? "Unknown"}**`,
    r.position ? `— ${r.position}` : "",
    r.current_company?.name ? `at ${r.current_company.name}` : "",
    r.city ? `· ${r.city}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const experience = (r.experience ?? [])
    .slice(0, 3)
    .map((e) => [e.title, e.company].filter(Boolean).join(" at "))
    .filter(Boolean)
    .join("; ");
  const lines = [
    header,
    experience ? `Experience: ${experience}` : null,
    r.about ? `About: ${clip(r.about, ABOUT_CAP)}` : null,
    r.url ?? r.input_url ? `LinkedIn: ${r.url ?? r.input_url}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function renderCompany(r: CompanyRecord): string {
  const industries = Array.isArray(r.industries)
    ? r.industries.join(", ")
    : r.industries ?? "";
  const header = [
    `**${r.name ?? "Unknown"}**`,
    industries ? `— ${industries}` : "",
    r.company_size ? `· ${r.company_size}` : "",
    r.headquarters ? `· HQ ${r.headquarters}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [
    header,
    [
      r.website ? `Website: ${r.website}` : null,
      r.founded ? `Founded: ${r.founded}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    r.about ? `About: ${clip(r.about, ABOUT_CAP)}` : null,
    r.url ? `LinkedIn: ${r.url}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function renderRecords(records: unknown[]): { text: string; count: number } {
  if (records.length === 0) return { text: "_No records returned._", count: 0 };
  const blocks: string[] = [];
  for (const record of records) {
    const r = record as ProfileRecord & CompanyRecord;
    blocks.push(isProfile(r) ? renderProfile(r) : renderCompany(r));
    if (blocks.join("\n\n").length > CHAR_CAP) break;
  }
  return { text: blocks.join("\n\n"), count: records.length };
}

function pendingText(snapshotId: string): string {
  return (
    `Collection is still running (snapshot \`${snapshotId}\`). ` +
    "Continue other work, then fetch the results with brightdata_get_snapshot."
  );
}

/** Runs a by-URL collection; falls back to a snapshot pointer for slow jobs. */
async function scrape(
  apiKey: string,
  datasetId: string,
  urls: string[],
): Promise<{ text: string; count: number; pending: boolean }> {
  if (!urls?.length) {
    return { text: "Provide at least one URL.", count: 0, pending: false };
  }
  const input = urls.slice(0, MAX_URLS).map((url) => ({ url }));
  let json: unknown;
  try {
    json = await call<unknown>(
      apiKey,
      `/datasets/v3/scrape?dataset_id=${datasetId}&include_errors=true`,
      { method: "POST", body: { input }, timeoutMs: SCRAPE_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        "Bright Data scrape timed out. Retry with fewer URLs, or trigger one URL at a time.",
      );
    }
    throw error;
  }
  // Large/slow jobs answer with a snapshot pointer instead of records.
  const snapshotId = (json as { snapshot_id?: string } | null)?.snapshot_id;
  if (snapshotId) {
    return { text: pendingText(snapshotId), count: 0, pending: true };
  }
  const records = Array.isArray(json) ? json : [];
  const rendered = renderRecords(records);
  return { ...rendered, pending: false };
}

export const brightdataAdapter: BrightDataAdapter = {
  provider: "brightdata",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await call<unknown>(apiKey, "/datasets/list");
      return { ok: true, accountLabel: "Bright Data account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async scrapeLinkedinProfiles(apiKey, { urls }) {
    return scrape(apiKey, PROFILE_DATASET, urls);
  },

  async scrapeLinkedinCompanies(apiKey, { urls }) {
    return scrape(apiKey, COMPANY_DATASET, urls);
  },

  async getSnapshot(apiKey, snapshotId) {
    if (!snapshotId) {
      return { text: "Provide a snapshot id.", count: 0, pending: false };
    }
    const progress = await call<{ status?: string }>(
      apiKey,
      `/datasets/v3/progress/${encodeURIComponent(snapshotId)}`,
    );
    if (progress.status && progress.status !== "ready") {
      if (progress.status === "failed") {
        return {
          text: `Collection \`${snapshotId}\` failed at Bright Data.`,
          count: 0,
          pending: false,
        };
      }
      return { text: pendingText(snapshotId), count: 0, pending: true };
    }
    const json = await call<unknown>(
      apiKey,
      `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
    );
    const records = Array.isArray(json) ? json : [];
    const rendered = renderRecords(records);
    return { ...rendered, pending: false };
  },
};
