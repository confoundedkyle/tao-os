import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Notion exposes data ops beyond the shared auth interface; its tools import
// this concrete type.
export interface NotionAdapter extends ConnectorAdapter {
  search(
    accessToken: string,
    args?: { query?: string; databasesOnly?: boolean; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  queryDatabase(
    accessToken: string,
    args: { databaseId: string; cursor?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  readPage(
    accessToken: string,
    pageId: string,
  ): Promise<{ text: string; found: boolean; truncated: boolean }>;
}

// Notion public OAuth. No PKCE — the token exchange authenticates with HTTP
// Basic (client_id:client_secret); state still guards CSRF. Access tokens
// never expire and there is no refresh token, so expiresAt stays null and
// getValidAccessToken never refreshes. Pinned to API version 2022-06-28 —
// later versions split databases into data sources and move the query
// endpoint. Property values are typed per column (title, rich_text, select,
// people, …), so rendering flattens each type to plain text.
const OAUTH_AUTHORIZE = "https://api.notion.com/v1/oauth/authorize";
const OAUTH_TOKEN = "https://api.notion.com/v1/oauth/token";
const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const MAX_COLUMNS = 8;
const CHAR_CAP = 12_000;

type NotionRichText = { plain_text?: string | null }[];

interface NotionPropertyValue {
  type?: string;
  title?: NotionRichText | null;
  rich_text?: NotionRichText | null;
  number?: number | null;
  select?: { name?: string | null } | null;
  status?: { name?: string | null } | null;
  multi_select?: { name?: string | null }[] | null;
  date?: { start?: string | null; end?: string | null } | null;
  people?: { name?: string | null }[] | null;
  email?: string | null;
  phone_number?: string | null;
  url?: string | null;
  checkbox?: boolean | null;
}

interface NotionPage {
  id?: string;
  object?: string;
  url?: string | null;
  last_edited_time?: string | null;
  title?: NotionRichText | null; // databases carry title at the top level
  properties?: Record<string, NotionPropertyValue> | null;
}

interface NotionBlock {
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
}

function plain(rt?: NotionRichText | null): string {
  return (rt ?? []).map((t) => t.plain_text ?? "").join("");
}

function propertyText(p?: NotionPropertyValue): string {
  if (!p) return "";
  switch (p.type) {
    case "title":
      return plain(p.title);
    case "rich_text":
      return plain(p.rich_text);
    case "number":
      return p.number == null ? "" : String(p.number);
    case "select":
      return p.select?.name ?? "";
    case "status":
      return p.status?.name ?? "";
    case "multi_select":
      return (p.multi_select ?? []).map((s) => s.name).filter(Boolean).join(", ");
    case "date":
      return [p.date?.start, p.date?.end].filter(Boolean).join(" → ");
    case "people":
      return (p.people ?? []).map((u) => u.name).filter(Boolean).join(", ");
    case "email":
      return p.email ?? "";
    case "phone_number":
      return p.phone_number ?? "";
    case "url":
      return p.url ?? "";
    case "checkbox":
      return p.checkbox ? "yes" : "no";
    default:
      return "";
  }
}

function pageTitle(page: NotionPage): string {
  if (page.title) return plain(page.title);
  for (const value of Object.values(page.properties ?? {})) {
    if (value.type === "title") return plain(value.title);
  }
  return "";
}

function tokensFromResponse(json: {
  access_token: string;
  workspace_name?: string | null;
}): OAuthTokens {
  return {
    accessToken: json.access_token,
    expiresAt: null, // Notion tokens don't expire
    accountLabel: json.workspace_name ?? undefined,
  };
}

async function api<T>(
  accessToken: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!res.ok) {
    throw new Error(
      `Notion API ${path} failed (${res.status}): ${json?.message ?? res.statusText}`,
    );
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const notionAdapter: NotionAdapter = {
  provider: "notion",
  authType: "oauth",

  getAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.notionClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      owner: "user",
      state,
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const creds = Buffer.from(
      `${env.notionClientId}:${env.notionClientSecret}`,
    ).toString("base64");
    const res = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Notion token exchange failed (${res.status}): ${detail}`);
    }
    return tokensFromResponse(await res.json());
  },

  async search(accessToken, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await api<{ results?: NotionPage[]; has_more?: boolean }>(
      accessToken,
      "POST",
      "/search",
      {
        ...(args?.query ? { query: args.query } : {}),
        ...(args?.databasesOnly
          ? { filter: { property: "object", value: "database" } }
          : {}),
        page_size: limit,
      },
    );
    const results = json.results ?? [];
    if (!results.length) {
      return { text: "_Nothing found._", count: 0, truncated: false };
    }
    const lines = [
      "| Title | Type | Last edited | ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const r of results) {
      lines.push(
        `| ${cell(pageTitle(r))} | ${cell(r.object)} | ${cell(
          (r.last_edited_time ?? "").slice(0, 10),
        )} | ${cell(r.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: `${lines.join("\n")}\n\n_Databases can be queried with notion_query_database; pages read with notion_read_page._`,
      count: results.length,
      truncated: truncated || !!json.has_more,
    };
  },

  async queryDatabase(accessToken, args) {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await api<{
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(accessToken, "POST", `/databases/${encodeURIComponent(args.databaseId)}/query`, {
      page_size: limit,
      ...(args.cursor ? { start_cursor: args.cursor } : {}),
    });
    const rows = json.results ?? [];
    if (!rows.length) {
      return { text: "_The database is empty._", count: 0, truncated: false };
    }
    // Columns vary per database — build the header from the first row,
    // title column first.
    const names = Object.entries(rows[0].properties ?? {});
    names.sort(([, a], [, b]) =>
      a.type === "title" ? -1 : b.type === "title" ? 1 : 0,
    );
    const columns = names.map(([name]) => name).slice(0, MAX_COLUMNS);
    const header = [...columns, "Page ID"];
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
    ];
    let truncated = false;
    for (const row of rows) {
      const cols = columns.map((c) => cell(propertyText(row.properties?.[c])));
      lines.push(`| ${[...cols, cell(row.id)].join(" | ")} |`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const notes = [
      names.length > MAX_COLUMNS ? `_Showing the first ${MAX_COLUMNS} columns._` : "",
      json.next_cursor ? `_More rows — pass cursor: ${json.next_cursor}_` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      text: `${lines.join("\n")}${notes ? `\n\n${notes}` : ""}`,
      count: rows.length,
      truncated: truncated || !!json.has_more,
    };
  },

  async readPage(accessToken, pageId) {
    const [page, blocks] = await Promise.all([
      api<NotionPage>(accessToken, "GET", `/pages/${encodeURIComponent(pageId)}`),
      api<{ results?: NotionBlock[] }>(
        accessToken,
        "GET",
        `/blocks/${encodeURIComponent(pageId)}/children?page_size=100`,
      ),
    ]);
    const props = Object.entries(page.properties ?? {})
      .map(([name, value]) => {
        const text = propertyText(value);
        return text ? `- ${name}: ${text}` : null;
      })
      .filter(Boolean);
    const body: string[] = [];
    for (const block of blocks.results ?? []) {
      const content = block[block.type ?? ""] as
        | { rich_text?: NotionRichText }
        | undefined;
      const text = plain(content?.rich_text);
      if (text) body.push(block.type?.startsWith("heading") ? `**${text}**` : text);
    }
    const parts = [
      `**${pageTitle(page) || "Untitled"}**`,
      props.length ? props.join("\n") : null,
      body.length ? `\n${body.join("\n")}` : null,
    ].filter(Boolean);
    const text = parts.join("\n");
    return {
      text:
        text.length > CHAR_CAP ? `${text.slice(0, CHAR_CAP)}\n…(page truncated)` : text,
      found: true,
      truncated: text.length > CHAR_CAP,
    };
  },
};
