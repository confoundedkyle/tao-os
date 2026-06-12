import "server-only";
import type { ConnectorAdapter } from "./types";

// Attio (modern CRM). Auth is a workspace API token (Attio: Workspace
// settings → Developers → access tokens; needs record and object read
// scopes) sent as a Bearer header. Objects (people, companies, deals, plus
// custom ones) are discovered first, then records are queried per object —
// POST by API design (filter body) with limit/offset paging. Attribute
// values arrive as arrays of typed objects whose payload field varies by
// attribute type (full_name / email_address / phone_number / value / …), so
// rendering extracts the first value generically.
const API = "https://api.attio.com/v2";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;
const DETAIL_ATTRS = 6; // value columns per record before truncating

interface AttioValue {
  attribute_type?: string;
  full_name?: string | null;
  email_address?: string | null;
  phone_number?: string | null;
  domain?: string | null;
  value?: unknown;
  option?: { title?: string | null } | null;
  currency_value?: number | null;
}

export interface AttioRecord {
  id?: { record_id?: string };
  values?: Record<string, AttioValue[] | undefined>;
}

export interface AttioObject {
  api_slug?: string;
  singular_noun?: string | null;
  plural_noun?: string | null;
}

export interface AttioAdapter extends ConnectorAdapter {
  listObjects(
    apiKey: string,
  ): Promise<{ text: string; count: number }>;
  queryRecords(
    apiKey: string,
    args: { object: string; limit?: number; offset?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { message?: string } | null)?.message ??
    (json as { error?: string } | null)?.error ??
    res.statusText;
  throw new Error(`Attio error (${res.status}): ${detail}`);
}

async function request<T>(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const init: RequestInit = { method, headers: headers(apiKey) };
  if (body) {
    init.headers = { ...headers(apiKey), "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(res, json);
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** First value of an attribute, rendered by whichever payload field its type uses. */
function renderValue(values?: AttioValue[]): string {
  const v = values?.[0];
  if (!v) return "";
  const raw =
    v.full_name ??
    v.email_address ??
    v.phone_number ??
    v.domain ??
    v.option?.title ??
    v.currency_value ??
    v.value;
  if (raw == null || typeof raw === "object") return "";
  return String(raw);
}

function recordLabel(r: AttioRecord): string {
  return (
    renderValue(r.values?.name) ||
    renderValue(r.values?.email_addresses) ||
    renderValue(r.values?.domains) ||
    "(unnamed)"
  );
}

export const attioAdapter: AttioAdapter = {
  provider: "attio",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const self = await request<{ workspace_name?: string }>(
        apiKey,
        "GET",
        "/self",
      );
      return {
        ok: true,
        accountLabel: self.workspace_name
          ? `Attio (${self.workspace_name})`
          : "Attio",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listObjects(apiKey) {
    const json = await request<{ data?: AttioObject[] }>(
      apiKey,
      "GET",
      "/objects",
    );
    const objects = json.data ?? [];
    const lines = ["| Object | Slug |", "| --- | --- |"];
    for (const o of objects) {
      lines.push(`| ${cell(o.plural_noun ?? o.singular_noun)} | ${cell(o.api_slug)} |`);
    }
    return {
      text: objects.length ? lines.join("\n") : "_No objects._",
      count: objects.length,
    };
  },

  async queryRecords(apiKey, args) {
    if (!args.object) {
      return {
        text: "Provide the object slug (from attio_list_objects), e.g. people or companies.",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    // POST by API design: record queries take a filter body.
    const json = await request<{ data?: AttioRecord[] }>(
      apiKey,
      "POST",
      `/objects/${encodeURIComponent(args.object)}/records/query`,
      { limit, offset: args.offset ?? 0 },
    );
    const records = json.data ?? [];
    const lines = [
      "| Record | Details | Record ID |",
      "| --- | --- | --- |",
    ];
    let truncated = false;
    for (const r of records) {
      const details: string[] = [];
      for (const [attr, values] of Object.entries(r.values ?? {})) {
        if (attr === "name") continue;
        const rendered = renderValue(values);
        if (!rendered) continue;
        details.push(`${attr}: ${rendered}`);
        if (details.length >= DETAIL_ATTRS) break;
      }
      lines.push(
        `| ${cell(recordLabel(r))} | ${cell(details.join(" · "))} | ${cell(
          r.id?.record_id,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: records.length ? lines.join("\n") : "_No records._",
      count: records.length,
      truncated: truncated || records.length === limit,
    };
  },
};
