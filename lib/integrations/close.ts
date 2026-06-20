import "server-only";
import type { ConnectorAdapter } from "./types";

// Close (sales/BD CRM popular with agencies). Auth is an API key (Close:
// Settings → Developer → API Keys) sent as HTTP Basic with the key as the
// username and an empty password — same scheme as Ashby. Reads are leads (the
// company/account object, GET /lead/ with Close's `query` smart-search and
// _skip/_limit offset paging) and opportunities (GET /opportunity/, scopable to
// one lead). Both list endpoints wrap results in { data, has_more }. Validation
// reads /me/ and labels the connection with the organization name.
const API = "https://api.close.com/api/v1";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

interface CloseEmail {
  email?: string | null;
}
interface ClosePhone {
  phone?: string | null;
}
interface CloseContact {
  name?: string | null;
  title?: string | null;
  emails?: CloseEmail[] | null;
  phones?: ClosePhone[] | null;
}

export interface CloseLead {
  id?: string;
  display_name?: string | null;
  status_label?: string | null;
  url?: string | null;
  contacts?: CloseContact[] | null;
}

export interface CloseOpportunity {
  id?: string;
  lead_name?: string | null;
  status_label?: string | null;
  value_formatted?: string | null;
  value?: number | null;
  confidence?: number | null;
  date_created?: string | null;
}

interface Paged<T> {
  data?: T[];
  has_more?: boolean;
}

export interface CloseAdapter extends ConnectorAdapter {
  searchLeads(
    apiKey: string,
    args?: { query?: string; limit?: number; skip?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listOpportunities(
    apiKey: string,
    args?: { leadId?: string; limit?: number; skip?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function authHeader(apiKey: string): string {
  // Key as username, empty password.
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
      (json as { error?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`Close error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const closeAdapter: CloseAdapter = {
  provider: "close",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const me = await get<{
        organizations?: { name?: string | null }[];
        first_name?: string | null;
        email?: string | null;
      }>(apiKey, "/me/");
      const org = me.organizations?.[0]?.name;
      const label = org ?? me.email ?? me.first_name;
      return { ok: true, accountLabel: label ? `Close (${label})` : "Close" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchLeads(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paged<CloseLead>>(apiKey, "/lead/", {
      query: args?.query,
      _limit: limit,
      _skip: args?.skip,
    });
    const leads = json.data ?? [];
    const lines = [
      "| Lead | Status | Contact | Email | Phone | Lead ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const l of leads) {
      const c = l.contacts?.[0];
      const contact = c
        ? [c.name, c.title].filter(Boolean).join(", ")
        : "";
      lines.push(
        `| ${cell(l.display_name)} | ${cell(l.status_label)} | ${cell(
          contact,
        )} | ${cell(c?.emails?.[0]?.email)} | ${cell(
          c?.phones?.[0]?.phone,
        )} | ${cell(l.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: leads.length ? lines.join("\n") : "_No leads found._",
      count: leads.length,
      truncated: truncated || json.has_more === true,
    };
  },

  async listOpportunities(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paged<CloseOpportunity>>(apiKey, "/opportunity/", {
      lead_id: args?.leadId,
      _limit: limit,
      _skip: args?.skip,
    });
    const opps = json.data ?? [];
    const lines = [
      "| Opportunity (lead) | Status | Value | Confidence | Created | Opportunity ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const o of opps) {
      const value = o.value_formatted ?? (o.value != null ? String(o.value) : "");
      const confidence = o.confidence != null ? `${o.confidence}%` : "";
      lines.push(
        `| ${cell(o.lead_name)} | ${cell(o.status_label)} | ${cell(
          value,
        )} | ${cell(confidence)} | ${cell(o.date_created?.slice(0, 10))} | ${cell(
          o.id,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: opps.length ? lines.join("\n") : "_No opportunities found._",
      count: opps.length,
      truncated: truncated || json.has_more === true,
    };
  },
};
