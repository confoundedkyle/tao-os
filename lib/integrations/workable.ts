import "server-only";
import type { ConnectorAdapter } from "./types";

// Workable ATS (SPI v3). Auth is an access token (Workable: Settings →
// Integrations → Apps → API Access Tokens) sent as a Bearer header. Endpoints
// live on the account's subdomain, but GET workable.com/spi/v3/accounts lists
// the accounts a token can reach — so the token alone is the credential and
// each call resolves the subdomain first. The /candidates endpoint doubles as
// search (email filter) and per-job pipeline (shortcode filter). Paging is
// since_id-based with a `paging.next` URL; one page per tool call.
const ROOT = "https://workable.com/spi/v3";

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 100; // Workable page max
const CHAR_CAP = 12_000;

interface WorkableAccount {
  subdomain?: string;
  name?: string;
}

export interface WorkableJob {
  title?: string | null;
  shortcode?: string | null;
  state?: string | null;
  department?: string | null;
  location?: { location_str?: string | null } | null;
}

export interface WorkableCandidate {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  headline?: string | null;
  stage?: string | null;
  disqualified?: boolean | null;
  job?: { title?: string | null; shortcode?: string | null } | null;
}

export interface WorkableAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { state?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args?: { shortcode?: string; stage?: string; email?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function get<T>(
  apiKey: string,
  url: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${url}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`Workable error (${res.status}): ${detail}`);
  }
  return json as T;
}

async function resolveAccount(apiKey: string): Promise<WorkableAccount> {
  const json = await get<{ accounts?: WorkableAccount[] }>(
    apiKey,
    `${ROOT}/accounts`,
  );
  const account = json.accounts?.[0];
  if (!account?.subdomain) {
    throw new Error("Workable returned no accounts for this token.");
  }
  return account;
}

function base(subdomain: string): string {
  return `https://${subdomain}.workable.com/spi/v3`;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const workableAdapter: WorkableAdapter = {
  provider: "workable",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const account = await resolveAccount(apiKey);
      return {
        ok: true,
        accountLabel: account.name ?? `Workable (${account.subdomain})`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const account = await resolveAccount(apiKey);
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{ jobs?: WorkableJob[]; paging?: { next?: string } }>(
      apiKey,
      `${base(account.subdomain!)}/jobs`,
      { state: args?.state, limit },
    );
    const jobs = json.jobs ?? [];
    const lines = [
      "| Job | State | Department | Location | Shortcode |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(j.title)} | ${cell(j.state)} | ${cell(j.department)} | ${cell(
          j.location?.location_str,
        )} | ${cell(j.shortcode)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || !!json.paging?.next,
    };
  },

  async listCandidates(apiKey, args) {
    const account = await resolveAccount(apiKey);
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      candidates?: WorkableCandidate[];
      paging?: { next?: string };
    }>(apiKey, `${base(account.subdomain!)}/candidates`, {
      shortcode: args?.shortcode,
      stage: args?.stage,
      email: args?.email,
      limit,
    });
    const candidates = json.candidates ?? [];
    const lines = [
      "| Name | Email | Phone | Headline | Stage | Job |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      lines.push(
        `| ${cell(c.name)} | ${cell(c.email)} | ${cell(c.phone)} | ${cell(
          c.headline,
        )} | ${cell(c.stage)}${c.disqualified ? " (disqualified)" : ""} | ${cell(
          c.job?.title,
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
      truncated: truncated || !!json.paging?.next,
    };
  },
};
