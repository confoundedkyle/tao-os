import "server-only";
import type { ConnectorAdapter } from "./types";

// HubSpot CRM. Auth is a Private App access token (Settings → Integrations →
// Private Apps in HubSpot; needs the crm.objects read scopes) sent as a Bearer
// header. Uses HubSpot's date-versioned API (the dated path replaces the old
// /crm/v3/; each version is immutable with an 18-month support floor). The
// search endpoints double as list-recent when no query is given. Search is
// rate-limited to 5 req/s per account — fine at agent step counts.
const API = "https://api.hubapi.com";
const VERSION = "2026-03";

const DEFAULT_LIMIT = 10;
const HARD_LIMIT = 200; // search page max
const CHAR_CAP = 12_000;

type Properties = Record<string, string | null | undefined>;

export interface HubspotAdapter extends ConnectorAdapter {
  searchContacts(
    apiKey: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCompanies(
    apiKey: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchDeals(
    apiKey: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

interface SearchResponse {
  total?: number;
  results?: { id: string; properties?: Properties }[];
}

async function search(
  apiKey: string,
  object: "contacts" | "companies" | "deals",
  args: { query?: string; limit?: number; properties: string[] },
): Promise<SearchResponse> {
  const body: Record<string, unknown> = {
    limit: Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT),
    properties: args.properties,
  };
  if (args.query) body.query = args.query;
  const res = await fetch(
    `${API}/crm/objects/${VERSION}/${object}/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`HubSpot error (${res.status}): ${detail}`);
  }
  return json as SearchResponse;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderTable(
  header: string[],
  rows: string[][],
  emptyText: string,
): { text: string; truncated: boolean } {
  if (rows.length === 0) return { text: emptyText, truncated: false };
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  let truncated = false;
  for (const row of rows) {
    lines.push(`| ${row.map(cell).join(" | ")} |`);
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

function toResult(
  json: SearchResponse,
  rendered: { text: string; truncated: boolean },
): { text: string; count: number; truncated: boolean } {
  const count = json.results?.length ?? 0;
  const total = json.total ?? count;
  return {
    text: rendered.text,
    count,
    truncated: rendered.truncated || total > count,
  };
}

export const hubspotAdapter: HubspotAdapter = {
  provider: "hubspot",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Cheap call on the same scope the tools need (crm.objects.contacts.read).
      await search(apiKey, "contacts", { limit: 1, properties: ["email"] });
      return { ok: true, accountLabel: "HubSpot portal" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchContacts(apiKey, args) {
    const json = await search(apiKey, "contacts", {
      ...args,
      properties: ["firstname", "lastname", "email", "jobtitle", "company", "phone"],
    });
    const rows = (json.results ?? []).map((r) => {
      const p = r.properties ?? {};
      return [
        [p.firstname, p.lastname].filter(Boolean).join(" "),
        p.email,
        p.jobtitle,
        p.company,
        p.phone,
      ] as string[];
    });
    return toResult(
      json,
      renderTable(
        ["Name", "Email", "Title", "Company", "Phone"],
        rows,
        "_No contacts found._",
      ),
    );
  },

  async searchCompanies(apiKey, args) {
    const json = await search(apiKey, "companies", {
      ...args,
      properties: ["name", "domain", "industry", "city", "country", "numberofemployees"],
    });
    const rows = (json.results ?? []).map((r) => {
      const p = r.properties ?? {};
      return [
        p.name,
        p.domain,
        p.industry,
        [p.city, p.country].filter(Boolean).join(", "),
        p.numberofemployees,
      ] as string[];
    });
    return toResult(
      json,
      renderTable(
        ["Company", "Domain", "Industry", "Location", "Employees"],
        rows,
        "_No companies found._",
      ),
    );
  },

  async searchDeals(apiKey, args) {
    const json = await search(apiKey, "deals", {
      ...args,
      properties: ["dealname", "amount", "dealstage", "pipeline", "closedate"],
    });
    const rows = (json.results ?? []).map((r) => {
      const p = r.properties ?? {};
      return [
        p.dealname,
        p.amount,
        p.dealstage,
        p.pipeline,
        p.closedate?.slice(0, 10),
      ] as string[];
    });
    return toResult(
      json,
      renderTable(
        ["Deal", "Amount", "Stage", "Pipeline", "Close date"],
        rows,
        "_No deals found._",
      ),
    );
  },
};
