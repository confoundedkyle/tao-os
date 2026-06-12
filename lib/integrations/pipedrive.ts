import "server-only";
import type { ConnectorAdapter } from "./types";

// Pipedrive CRM. Auth is the per-user API token (Pipedrive: Personal
// preferences → API) sent in the `x-api-token` header — the token is tied to
// a company, so the generic api.pipedrive.com host works without a company
// subdomain. Search endpoints need a term of 2+ characters and return
// {data: {items: [{item}]}}; validation reads /users/me (free) and labels the
// connection with the company name.
const API = "https://api.pipedrive.com/v1";

const DEFAULT_LIMIT = 15;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

interface SearchItems<T> {
  data?: { items?: { item?: T }[] } | null;
  additional_data?: { pagination?: { more_items_in_collection?: boolean } };
}

interface PipedrivePerson {
  id?: number;
  name?: string | null;
  primary_email?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  organization?: { name?: string | null } | null;
}

interface PipedriveOrganization {
  id?: number;
  name?: string | null;
  address?: string | null;
}

interface PipedriveDeal {
  id?: number;
  title?: string | null;
  value?: number | null;
  currency?: string | null;
  status?: string | null;
  organization?: { name?: string | null } | null;
  person?: { name?: string | null } | null;
}

export interface PipedriveAdapter extends ConnectorAdapter {
  searchPersons(
    apiKey: string,
    args: { term: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchOrganizations(
    apiKey: string,
    args: { term: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchDeals(
    apiKey: string,
    args: { term: string; limit?: number },
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
    headers: { "x-api-token": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ?? res.statusText;
    throw new Error(`Pipedrive error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function guard(term: string):
  | { text: string; count: number; truncated: boolean }
  | null {
  if (!term || term.trim().length < 2) {
    return {
      text: "Provide a search term of at least 2 characters.",
      count: 0,
      truncated: false,
    };
  }
  return null;
}

function items<T>(json: SearchItems<T>): T[] {
  return (json.data?.items ?? [])
    .map((i) => i.item)
    .filter((x): x is T => !!x);
}

function more(json: SearchItems<unknown>): boolean {
  return !!json.additional_data?.pagination?.more_items_in_collection;
}

export const pipedriveAdapter: PipedriveAdapter = {
  provider: "pipedrive",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const json = await get<{
        data?: { name?: string; company_name?: string };
      }>(apiKey, "/users/me");
      return {
        ok: true,
        accountLabel:
          json.data?.company_name ?? json.data?.name ?? "Pipedrive account",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchPersons(apiKey, args) {
    const guarded = guard(args.term);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<SearchItems<PipedrivePerson>>(
      apiKey,
      "/persons/search",
      { term: args.term, limit },
    );
    const persons = items(json);
    const lines = [
      "| Name | Email | Phone | Organization |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of persons) {
      lines.push(
        `| ${cell(p.name)} | ${cell(p.primary_email ?? p.emails?.[0])} | ${cell(
          p.phones?.[0],
        )} | ${cell(p.organization?.name)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: persons.length ? lines.join("\n") : "_No persons found._",
      count: persons.length,
      truncated: truncated || more(json),
    };
  },

  async searchOrganizations(apiKey, args) {
    const guarded = guard(args.term);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<SearchItems<PipedriveOrganization>>(
      apiKey,
      "/organizations/search",
      { term: args.term, limit },
    );
    const orgs = items(json);
    const lines = ["| Organization | Address |", "| --- | --- |"];
    let truncated = false;
    for (const o of orgs) {
      lines.push(`| ${cell(o.name)} | ${cell(o.address)} |`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: orgs.length ? lines.join("\n") : "_No organizations found._",
      count: orgs.length,
      truncated: truncated || more(json),
    };
  },

  async searchDeals(apiKey, args) {
    const guarded = guard(args.term);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<SearchItems<PipedriveDeal>>(
      apiKey,
      "/deals/search",
      { term: args.term, limit },
    );
    const deals = items(json);
    const lines = [
      "| Deal | Value | Status | Organization | Person |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const d of deals) {
      const value =
        d.value != null ? `${d.value}${d.currency ? ` ${d.currency}` : ""}` : "";
      lines.push(
        `| ${cell(d.title)} | ${cell(value)} | ${cell(d.status)} | ${cell(
          d.organization?.name,
        )} | ${cell(d.person?.name)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: deals.length ? lines.join("\n") : "_No deals found._",
      count: deals.length,
      truncated: truncated || more(json),
    };
  },
};
