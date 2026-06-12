import "server-only";
import type { ConnectorAdapter } from "./types";

// Crelate ATS/CRM (API v3). Auth is a per-user API key (Crelate: Settings →
// My Settings & Preferences → API Key, must be enabled first) sent as an
// api_key querystring parameter. Responses use a {Data, Metadata, Errors}
// envelope with TotalRecords in the metadata; lists page with offset/limit
// (max 100). Keyword search (/contacts/search) returns only id + title, so
// the search op hydrates the hits through GET /contacts?ids=… to render the
// same full rows as the list op. Contact fields are typed per channel
// (EmailAddresses_Work, PhoneNumbers_Mobile, …), each a single object with a
// Value.
const API = "https://app.crelate.com/api3";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

interface CrelateLookup {
  Id?: string | null;
  Title?: string | null;
}

interface CrelateValue {
  Value?: string | null;
  IsPrimary?: boolean | null;
}

export interface CrelateContact {
  Id?: string | null;
  Name?: string | null;
  FullName?: string | null;
  CurrentPosition?: {
    JobTitle?: string | null;
    CompanyId?: CrelateLookup | null;
  } | null;
  EmailAddresses_Work?: CrelateValue | null;
  EmailAddresses_Personal?: CrelateValue | null;
  EmailAddresses_Other?: CrelateValue | null;
  PhoneNumbers_Mobile?: CrelateValue | null;
  PhoneNumbers_Work_Direct?: CrelateValue | null;
  PhoneNumbers_Work_Main?: CrelateValue | null;
  PhoneNumbers_Other?: CrelateValue | null;
  Websites_LinkedIn?: CrelateValue | null;
}

export interface CrelateJob {
  Id?: string | null;
  Name?: string | null;
  AccountId?: CrelateLookup | null;
  JobCode?: string | null;
  NumberOfOpenings?: number | null;
  SalesWorkflowItemStatusId?: CrelateLookup | null;
  CreatedOn?: string | null;
  IsOnHold?: boolean | null;
}

interface CrelateEnvelope<T> {
  Data?: T | null;
  Metadata?: { TotalRecords?: number | null } | null;
  Errors?: { Message?: string | null }[] | null;
}

export interface CrelateAdapter extends ConnectorAdapter {
  listJobs(
    apiKey: string,
    args?: { name?: string; offset?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listContacts(
    apiKey: string,
    args?: {
      recordType?: string;
      email?: string;
      offset?: number;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchContacts(
    apiKey: string,
    args: { query: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<CrelateEnvelope<T>> {
  const sp = new URLSearchParams({ api_key: apiKey });
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const res = await fetch(`${API}${path}?${sp.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const json = (await res.json().catch(() => null)) as CrelateEnvelope<T> | null;
  if (!res.ok) {
    const detail = json?.Errors?.[0]?.Message ?? res.statusText;
    throw new Error(`Crelate error (${res.status}): ${detail}`);
  }
  return json ?? {};
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function firstValue(...candidates: (CrelateValue | null | undefined)[]): string {
  const primary = candidates.find((c) => c?.IsPrimary && c.Value);
  return primary?.Value ?? candidates.find((c) => c?.Value)?.Value ?? "";
}

function renderContacts(
  contacts: CrelateContact[],
  total: number,
): { text: string; count: number; truncated: boolean } {
  if (!contacts.length) {
    return { text: "_No contacts found._", count: 0, truncated: false };
  }
  const lines = [
    "| Name | Title | Company | Email | Phone | LinkedIn | Contact ID |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const c of contacts) {
    const email = firstValue(
      c.EmailAddresses_Work,
      c.EmailAddresses_Personal,
      c.EmailAddresses_Other,
    );
    const phone = firstValue(
      c.PhoneNumbers_Mobile,
      c.PhoneNumbers_Work_Direct,
      c.PhoneNumbers_Work_Main,
      c.PhoneNumbers_Other,
    );
    lines.push(
      `| ${cell(c.Name ?? c.FullName)} | ${cell(c.CurrentPosition?.JobTitle)} | ${cell(
        c.CurrentPosition?.CompanyId?.Title,
      )} | ${cell(email)} | ${cell(phone)} | ${cell(
        c.Websites_LinkedIn?.Value,
      )} | ${cell(c.Id)} |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return {
    text: `${lines.join("\n")}\n\n_${total} total matches._`,
    count: contacts.length,
    truncated: truncated || total > contacts.length,
  };
}

export const crelateAdapter: CrelateAdapter = {
  provider: "crelate",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/jobs", { limit: 1 });
      return { ok: true, accountLabel: "Crelate" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<CrelateJob[]>(apiKey, "/jobs", {
      name: args?.name,
      limit,
      offset: args?.offset,
    });
    const jobs = json.Data ?? [];
    if (!jobs.length) {
      return { text: "_No jobs found._", count: 0, truncated: false };
    }
    const lines = [
      "| Job | Company | Status | Openings | Created | Job ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const status = [
        j.SalesWorkflowItemStatusId?.Title,
        j.IsOnHold ? "on hold" : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${cell(j.Name)}${j.JobCode ? ` (${cell(j.JobCode)})` : ""} | ${cell(
          j.AccountId?.Title,
        )} | ${cell(status)} | ${j.NumberOfOpenings ?? ""} | ${cell(
          (j.CreatedOn ?? "").slice(0, 10),
        )} | ${cell(j.Id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.Metadata?.TotalRecords ?? jobs.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total jobs._`,
      count: jobs.length,
      truncated: truncated || total > jobs.length,
    };
  },

  async listContacts(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<CrelateContact[]>(apiKey, "/contacts", {
      record_types: args?.recordType,
      emails: args?.email,
      limit,
      offset: args?.offset,
    });
    return renderContacts(
      json.Data ?? [],
      json.Metadata?.TotalRecords ?? (json.Data ?? []).length,
    );
  },

  async searchContacts(apiKey, args) {
    if (!args.query?.trim()) {
      return {
        text: "Provide a keyword query (name, skill, company, …) to search contacts.",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const search = await get<{ Id?: string | null }[]>(
      apiKey,
      "/contacts/search",
      { query: args.query, limit },
    );
    const ids = (search.Data ?? [])
      .map((r) => r.Id)
      .filter((id): id is string => !!id);
    if (!ids.length) {
      return { text: "_No contacts found._", count: 0, truncated: false };
    }
    const json = await get<CrelateContact[]>(apiKey, "/contacts", {
      ids: ids.join(","),
      limit: ids.length,
    });
    return renderContacts(json.Data ?? [], ids.length);
  },
};
