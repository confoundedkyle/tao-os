import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens, ResourceRef } from "./types";

// Airtable exposes data ops beyond the shared auth interface; its tools import
// this concrete type.
export interface AirtableAdapter extends ConnectorAdapter {
  listBases(accessToken: string): Promise<{ id: string; name: string }[]>;
  listTables(
    accessToken: string,
    baseId: string,
  ): Promise<{ id: string; name: string }[]>;
  queryRecords(
    accessToken: string,
    ref: ResourceRef & { filterFormula?: string; maxRecords?: number },
  ): Promise<{ text: string; recordCount: number; truncated: boolean }>;
}

// Airtable OAuth2 (PKCE) + REST. Access tokens last ~60 min; refresh tokens are
// SINGLE-USE and rotate on every refresh — refreshToken() returns the new pair
// and the caller (getValidAccessToken in ./index.ts) must persist it.
const OAUTH_AUTHORIZE = "https://airtable.com/oauth2/v1/authorize";
const OAUTH_TOKEN = "https://airtable.com/oauth2/v1/token";
const API = "https://api.airtable.com/v0";

export const AIRTABLE_SCOPES = "data.records:read schema.bases:read";

// Render caps so a wide/tall table can't blow the prompt budget.
const DEFAULT_MAX_RECORDS = 50;
const HARD_MAX_RECORDS = 200;
const CHAR_CAP = 12_000;

function basicAuthHeader(): string {
  const creds = `${env.airtableClientId}:${env.airtableClientSecret}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

function tokensFromResponse(json: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): OAuthTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    scopes: json.scope,
  };
}

async function postToken(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Airtable token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Airtable API ${path} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

function renderRecords(
  records: { id: string; fields: Record<string, unknown> }[],
): { text: string; truncated: boolean } {
  if (records.length === 0) return { text: "_No records._", truncated: false };
  // Union of field names, in first-seen order, as table columns.
  const columns: string[] = [];
  for (const r of records)
    for (const k of Object.keys(r.fields))
      if (!columns.includes(k)) columns.push(k);

  const cell = (v: unknown): string => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join(", ") : String(v);
    return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  };
  const header = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const lines = [header, sep];
  let truncated = false;
  for (const r of records) {
    lines.push(`| ${columns.map((c) => cell(r.fields[c])).join(" | ")} |`);
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const airtableAdapter: AirtableAdapter = {
  provider: "airtable",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.airtableClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: AIRTABLE_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const tokens = await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.airtableClientId,
        code_verifier: codeVerifier,
      }),
    );
    // Best-effort account label; whoami needs no extra scope.
    try {
      const who = await apiGet<{ id: string; email?: string }>(
        tokens.accessToken,
        "/meta/whoami",
      );
      tokens.accountLabel = who.email ?? who.id;
    } catch {
      // Non-fatal — leave the label unset.
    }
    return tokens;
  },

  async refreshToken(refreshToken) {
    return postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.airtableClientId,
      }),
    );
  },

  async listBases(accessToken) {
    const json = await apiGet<{
      bases: { id: string; name: string }[];
    }>(accessToken, "/meta/bases");
    return json.bases.map((b) => ({ id: b.id, name: b.name }));
  },

  async listTables(accessToken, baseId) {
    const json = await apiGet<{
      tables: { id: string; name: string }[];
    }>(accessToken, `/meta/bases/${baseId}/tables`);
    return json.tables.map((t) => ({ id: t.id, name: t.name }));
  },

  async queryRecords(
    accessToken,
    ref: ResourceRef & { filterFormula?: string; maxRecords?: number },
  ) {
    const target = Math.min(
      ref.maxRecords ?? DEFAULT_MAX_RECORDS,
      HARD_MAX_RECORDS,
    );
    const records: { id: string; fields: Record<string, unknown> }[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({
        pageSize: String(Math.min(100, target - records.length)),
      });
      if (ref.filterFormula) params.set("filterByFormula", ref.filterFormula);
      if (offset) params.set("offset", offset);
      const json = await apiGet<{
        records: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      }>(accessToken, `/${ref.baseId}/${ref.tableId}?${params.toString()}`);
      records.push(...json.records);
      offset = json.offset;
    } while (offset && records.length < target);

    const pageTruncated = !!offset; // more records existed than we fetched
    const { text, truncated: charTruncated } = renderRecords(
      records.slice(0, target),
    );
    return {
      text,
      recordCount: Math.min(records.length, target),
      truncated: pageTruncated || charTruncated,
    };
  },
};
