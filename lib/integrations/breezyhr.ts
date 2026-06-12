import "server-only";
import type { ConnectorAdapter } from "./types";

// BreezyHR ATS. Auth is an access token sent directly in the `Authorization`
// header (no Bearer prefix). Breezy doesn't issue permanent API keys — the
// token comes from POST /v3/signin (valid ~30 days), so an expired connection
// surfaces as a 401 and the user reconnects with a fresh token. Endpoints are
// GET and scoped to a company; most accounts have exactly one, so tools
// resolve the first company when none is given. Candidates are listed per
// position — there is no account-wide candidate list.
const API = "https://api.breezy.hr/v3";

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 200;
const PAGE_SIZE = 100;
const CHAR_CAP = 12_000;

export interface BreezyCompany {
  _id: string;
  name?: string | null;
}

export interface BreezyPosition {
  _id: string;
  name?: string | null;
  state?: string | null;
  department?: string | null;
  location?: { name?: string | null } | string | null;
  type?: { name?: string | null } | string | null;
}

export interface BreezyCandidate {
  _id: string;
  name?: string | null;
  email_address?: string | null;
  phone_number?: string | null;
  headline?: string | null;
  address?: string | null;
  origin?: string | null;
  stage?: { name?: string | null } | null;
}

export interface BreezyhrAdapter extends ConnectorAdapter {
  listPositions(
    apiKey: string,
    args?: { companyId?: string; state?: string },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    apiKey: string,
    args: { positionId: string; companyId?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    apiKey: string,
    args: { email: string; companyId?: string },
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
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`BreezyHR error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Resolves the company to operate on — the given id, or the account's first. */
async function resolveCompany(
  apiKey: string,
  companyId?: string,
): Promise<BreezyCompany> {
  const companies = await get<BreezyCompany[]>(apiKey, "/companies");
  if (!Array.isArray(companies) || companies.length === 0) {
    throw new Error("BreezyHR returned no companies for this token.");
  }
  if (!companyId) return companies[0];
  const match = companies.find((c) => c._id === companyId);
  if (!match) {
    throw new Error(
      `BreezyHR company ${companyId} not found. Available: ${companies
        .map((c) => `${c.name ?? "?"} (${c._id})`)
        .join(", ")}`,
    );
  }
  return match;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function nameOfObj(
  v: { name?: string | null } | string | null | undefined,
): string {
  if (!v) return "";
  return typeof v === "string" ? v : v.name ?? "";
}

function companyLine(company: BreezyCompany): string {
  return `_Company: ${company.name ?? "Unknown"} (${company._id})_`;
}

function renderCandidates(candidates: BreezyCandidate[]): {
  text: string;
  truncated: boolean;
} {
  if (candidates.length === 0)
    return { text: "_No candidates._", truncated: false };
  const lines = [
    "| Name | Email | Phone | Headline | Stage | Origin | Candidate ID |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const c of candidates) {
    lines.push(
      `| ${cell(c.name)} | ${cell(c.email_address)} | ${cell(
        c.phone_number,
      )} | ${cell(c.headline)} | ${cell(c.stage?.name)} | ${cell(c.origin)} | ${
        c._id
      } |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const breezyhrAdapter: BreezyhrAdapter = {
  provider: "breezyhr",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const companies = await get<BreezyCompany[]>(apiKey, "/companies");
      const label = Array.isArray(companies)
        ? companies[0]?.name ?? "BreezyHR account"
        : "BreezyHR account";
      return { ok: true, accountLabel: label };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listPositions(apiKey, args) {
    const company = await resolveCompany(apiKey, args?.companyId);
    const positions = await get<BreezyPosition[]>(
      apiKey,
      `/company/${company._id}/positions`,
      { state: args?.state },
    );
    const list = Array.isArray(positions) ? positions : [];
    const lines = [
      "| Position | State | Department | Location | Type | Position ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of list) {
      lines.push(
        `| ${cell(p.name)} | ${cell(p.state)} | ${cell(p.department)} | ${cell(
          nameOfObj(p.location),
        )} | ${cell(nameOfObj(p.type))} | ${p._id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: `${companyLine(company)}\n\n${
        list.length ? lines.join("\n") : "_No positions._"
      }`,
      count: list.length,
      truncated,
    };
  },

  async listCandidates(apiKey, args) {
    if (!args.positionId) {
      return {
        text: "Provide a positionId (from breezyhr_list_positions).",
        count: 0,
        truncated: false,
      };
    }
    const company = await resolveCompany(apiKey, args.companyId);
    const target = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const candidates: BreezyCandidate[] = [];
    let page = 1;
    let lastBatch = 0;
    do {
      const batch = await get<BreezyCandidate[]>(
        apiKey,
        `/company/${company._id}/position/${args.positionId}/candidates`,
        { page, page_size: Math.min(PAGE_SIZE, target) },
      );
      const items = Array.isArray(batch) ? batch : [];
      candidates.push(...items);
      lastBatch = items.length;
      page += 1;
    } while (lastBatch === Math.min(PAGE_SIZE, target) && candidates.length < target);
    const sliced = candidates.slice(0, target);
    const rendered = renderCandidates(sliced);
    return {
      text: `${companyLine(company)}\n\n${rendered.text}`,
      count: sliced.length,
      truncated: rendered.truncated || candidates.length > sliced.length,
    };
  },

  async searchCandidates(apiKey, args) {
    if (!args.email) {
      return {
        text: "Provide an email address to search for.",
        count: 0,
        truncated: false,
      };
    }
    const company = await resolveCompany(apiKey, args.companyId);
    const results = await get<BreezyCandidate[]>(
      apiKey,
      `/company/${company._id}/candidates/search`,
      { email_address: args.email },
    );
    const list = Array.isArray(results) ? results : [];
    const rendered = renderCandidates(list);
    return {
      text: `${companyLine(company)}\n\n${rendered.text}`,
      count: list.length,
      truncated: rendered.truncated,
    };
  },
};
