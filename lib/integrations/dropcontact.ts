import "server-only";
import type { ConnectorAdapter } from "./types";

// Dropcontact (GDPR-native EU contact enrichment). Auth is a static API key
// (Dropcontact: Settings → Your API key) sent as an X-Access-Token header — no
// token exchange. Enrichment is async by API design: POST /enrich/all returns a
// request_id, and GET /enrich/all/{request_id} is polled until the batch
// finishes — the same pending/poll shape as the Snov.io finder/verifier tools.
// While a batch is still running the GET returns 200 with success:false and a
// human reason, so we treat that as "pending" and hand the request_id back for
// a later poll. The enriched `data` payload uses arrays for multi-valued fields
// (email is [{email, qualification}], phone is [{number}]), so rendering pulls
// the first of each and falls back to capped raw JSON when the shape surprises.
const API = "https://api.dropcontact.com/v1";

const CHAR_CAP = 8_000;

export interface DropcontactContact {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  website?: string;
  linkedin?: string;
}

export interface DropcontactAdapter extends ConnectorAdapter {
  enrich(
    apiKey: string,
    contact: DropcontactContact,
  ): Promise<{ text: string; pending: boolean }>;
  getResult(
    apiKey: string,
    args: { requestId: string },
  ): Promise<{ text: string; pending: boolean }>;
}

interface EnrichValue {
  email?: string;
  qualification?: string;
  number?: string;
}

interface EnrichedRow {
  email?: EnrichValue[] | string | null;
  phone?: EnrichValue[] | string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  civility?: string | null;
  job?: string | null;
  company?: string | null;
  website?: string | null;
  linkedin?: string | null;
}

interface EnrichResponse {
  success?: boolean;
  request_id?: string;
  credits_left?: number;
  reason?: string;
  error?: boolean | string;
  data?: EnrichedRow[];
}

async function request(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<EnrichResponse> {
  const init: RequestInit = {
    method,
    headers: {
      "X-Access-Token": apiKey,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, init);
  const json = (await res.json().catch(() => null)) as EnrichResponse | null;
  if (!res.ok) {
    const detail = json?.reason ?? (typeof json?.error === "string" ? json.error : res.statusText);
    throw new Error(`Dropcontact error (${res.status}): ${detail}`);
  }
  return json ?? {};
}

/** Dropcontact input row: snake_case keys, only the fields the caller supplied. */
function toRow(c: DropcontactContact): Record<string, string> {
  const row: Record<string, string> = {};
  if (c.email) row.email = c.email;
  if (c.firstName) row.first_name = c.firstName;
  if (c.lastName) row.last_name = c.lastName;
  if (c.fullName) row.full_name = c.fullName;
  if (c.company) row.company = c.company;
  if (c.website) row.website = c.website;
  if (c.linkedin) row.linkedin = c.linkedin;
  return row;
}

function renderLoose(value: unknown): string {
  const s = JSON.stringify(value, null, 1) ?? String(value);
  return s.length > CHAR_CAP ? `${s.slice(0, CHAR_CAP)}\n…(truncated)` : s;
}

/** First email + its qualification (e.g. "nominative@pro" is the strongest). */
function firstEmail(email: EnrichedRow["email"]): string {
  if (!email) return "";
  if (typeof email === "string") return email;
  const e = email[0];
  if (!e?.email) return "";
  return e.qualification ? `${e.email} (${e.qualification})` : e.email;
}

function firstPhone(phone: EnrichedRow["phone"]): string {
  if (!phone) return "";
  if (typeof phone === "string") return phone;
  return phone[0]?.number ?? "";
}

function renderRow(row: EnrichedRow): string {
  const name =
    row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ");
  const headline = [
    `**${name || "Unknown"}**`,
    row.job ? `— ${row.job}` : "",
    row.company ? `at ${row.company}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lines: string[] = [headline];
  const email = firstEmail(row.email);
  if (email) lines.push(`Email: ${email}`);
  const phone = firstPhone(row.phone);
  if (phone) lines.push(`Phone: ${phone}`);
  if (row.linkedin) lines.push(`LinkedIn: ${row.linkedin}`);
  if (row.website) lines.push(`Website: ${row.website}`);
  return lines.join("\n");
}

function renderResult(json: EnrichResponse): { text: string; pending: boolean } {
  // While the batch is still running Dropcontact returns 200 with success:false
  // and a reason; treat that as pending so the agent can poll again.
  if (json.success === false || !json.data) {
    return {
      text: `Dropcontact is still processing this request (request id ${
        json.request_id ?? "unknown"
      })${json.reason ? ` — ${json.reason}` : ""}. Call dropcontact_get_result again with that request id after working on something else for a moment.`,
      pending: true,
    };
  }
  const row = json.data[0];
  if (!row) return { text: "_No enrichment returned._", pending: false };
  const rendered = renderRow(row);
  // If nothing recognisable came back, fall back to raw JSON so nothing is lost.
  return {
    text: rendered.startsWith("**Unknown**") && !firstEmail(row.email)
      ? renderLoose(row)
      : rendered,
    pending: false,
  };
}

export const dropcontactAdapter: DropcontactAdapter = {
  provider: "dropcontact",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Posting one empty object returns the remaining credits without
      // consuming any — Dropcontact's documented "check my key" call.
      const json = await request(apiKey, "POST", "/enrich/all", {
        data: [{}],
      });
      const credits = json.credits_left;
      return {
        ok: true,
        accountLabel:
          typeof credits === "number"
            ? `Dropcontact (${credits} credits)`
            : "Dropcontact",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async enrich(apiKey, contact) {
    const row = toRow(contact);
    if (Object.keys(row).length === 0) {
      return {
        text: "Provide at least one of: email, fullName (or firstName + lastName), company, website, or linkedin.",
        pending: false,
      };
    }
    const started = await request(apiKey, "POST", "/enrich/all", {
      data: [row],
      language: "en",
    });
    if (!started.request_id) return { text: renderLoose(started), pending: false };
    // Enrichment is never instant — hand the request_id back to poll.
    return {
      text: `Dropcontact accepted the enrichment (request id ${started.request_id}). Call dropcontact_get_result with that request id in a few seconds to read the result.`,
      pending: true,
    };
  },

  async getResult(apiKey, args) {
    if (!args.requestId) return { text: "Provide the requestId.", pending: false };
    const json = await request(
      apiKey,
      "GET",
      `/enrich/all/${encodeURIComponent(args.requestId)}`,
    );
    return renderResult(json);
  },
};
