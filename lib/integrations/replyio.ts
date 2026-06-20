import "server-only";
import type { ConnectorAdapter } from "./types";

// Reply.io (multichannel sales-engagement / outreach, API v3). Auth is an API
// key (Reply.io: Settings → API key) sent as a Bearer token. Reads are
// sequences (GET /v3/sequences) and contacts (GET /v3/contacts), both wrapped
// in an { items, hasMore } envelope with offset paging via top/skip (top max
// 1000). Contacts can be filtered by email. validateApiKey uses /v3/whoami,
// the documented "confirm your credentials" endpoint. Mirrors the Woodpecker
// outreach adapter, adapted to v3's camelCase fields and paged envelope.
const API = "https://api.reply.io";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

export interface ReplyioSequence {
  id?: number;
  name?: string | null;
  status?: string | null;
  health?: string | null;
  created?: string | null;
  isArchived?: boolean;
}

export interface ReplyioContact {
  id?: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  linkedInUrl?: string | null;
}

interface Paged<T> {
  items?: T[];
  hasMore?: boolean;
}

export interface ReplyioAdapter extends ConnectorAdapter {
  listSequences(
    apiKey: string,
    args?: { status?: string; limit?: number; skip?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listContacts(
    apiKey: string,
    args?: { email?: string; limit?: number; skip?: number },
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
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { detail?: string } | null)?.detail ??
      (json as { title?: string } | null)?.title ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`Reply.io error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const replyioAdapter: ReplyioAdapter = {
  provider: "replyio",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const me = await get<{
        email?: string | null;
        name?: string | null;
        fullName?: string | null;
        companyName?: string | null;
      }>(apiKey, "/v3/whoami");
      const label = me.email ?? me.fullName ?? me.name;
      return { ok: true, accountLabel: label ? `Reply.io (${label})` : "Reply.io" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listSequences(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paged<ReplyioSequence>>(apiKey, "/v3/sequences", {
      top: limit,
      skip: args?.skip,
      status: args?.status,
    });
    const items = json.items ?? [];
    const lines = [
      "| Sequence | Status | Health | Created | Sequence ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const s of items) {
      lines.push(
        `| ${cell(s.name)} | ${cell(s.status)} | ${cell(s.health)} | ${cell(
          s.created?.slice(0, 10),
        )} | ${s.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: items.length ? lines.join("\n") : "_No sequences._",
      count: items.length,
      truncated: truncated || json.hasMore === true,
    };
  },

  async listContacts(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<Paged<ReplyioContact>>(apiKey, "/v3/contacts", {
      top: limit,
      skip: args?.skip,
      email: args?.email,
    });
    const items = json.items ?? [];
    const lines = [
      "| Name | Email | Company | Title | Phone | LinkedIn | Contact ID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of items) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(c.email)} | ${cell(c.company)} | ${cell(
          c.title,
        )} | ${cell(c.phone)} | ${cell(c.linkedInUrl)} | ${c.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: items.length ? lines.join("\n") : "_No contacts found._",
      count: items.length,
      truncated: truncated || json.hasMore === true,
    };
  },
};
