import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Google Sheets exposes data ops beyond the shared auth interface; its tools
// import this concrete type.
export interface GoogleSheetsAdapter extends ConnectorAdapter {
  listSpreadsheets(
    accessToken: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listSheets(
    accessToken: string,
    spreadsheetId: string,
  ): Promise<{ title: string; sheets: { title: string; rows: number; columns: number }[] }>;
  readRange(
    accessToken: string,
    args: { spreadsheetId: string; range: string; maxRows?: number },
  ): Promise<{ text: string; rowCount: number; truncated: boolean }>;
}

// Google OAuth2 (PKCE + client secret — Google web apps require both) against
// the Sheets v4 + Drive v3 read scopes. Refresh tokens are long-lived and do
// NOT rotate (Google omits refresh_token on refresh responses, which
// getValidAccessToken in ./index.ts already handles by keeping the old one).
// access_type=offline + prompt=consent are required or Google only issues a
// refresh token on the very first consent. Spreadsheet discovery goes through
// the Drive files API (the Sheets API has no list call); reads go through
// /values with an A1-notation range.
const OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "email",
].join(" ");

const DEFAULT_FILES = 20;
const DEFAULT_MAX_ROWS = 50;
const HARD_MAX_ROWS = 200;
const CHAR_CAP = 12_000;

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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

async function apiGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google API request failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

function cell(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const googleSheetsAdapter: GoogleSheetsAdapter = {
  provider: "google-sheets",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SHEETS_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const tokens = await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        code_verifier: codeVerifier,
      }),
    );
    // Best-effort account label from the OIDC userinfo endpoint.
    try {
      const who = await apiGet<{ email?: string }>(
        tokens.accessToken,
        "https://openidconnect.googleapis.com/v1/userinfo",
      );
      tokens.accountLabel = who.email;
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
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
      }),
    );
  },

  async listSpreadsheets(accessToken, args) {
    const q = [
      "mimeType='application/vnd.google-apps.spreadsheet'",
      "trashed=false",
      args?.query ? `name contains '${args.query.replace(/'/g, "\\'")}'` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const params = new URLSearchParams({
      q,
      orderBy: "modifiedTime desc",
      pageSize: String(args?.limit ?? DEFAULT_FILES),
      fields: "nextPageToken,files(id,name,modifiedTime)",
    });
    const json = await apiGet<{
      files?: { id?: string; name?: string; modifiedTime?: string }[];
      nextPageToken?: string;
    }>(accessToken, `${DRIVE_API}/files?${params.toString()}`);
    const files = json.files ?? [];
    if (!files.length) {
      return { text: "_No spreadsheets found._", count: 0, truncated: false };
    }
    const lines = [
      "| Spreadsheet | Modified | Spreadsheet ID |",
      "| --- | --- | --- |",
    ];
    let truncated = false;
    for (const f of files) {
      lines.push(
        `| ${cell(f.name)} | ${cell((f.modifiedTime ?? "").slice(0, 10))} | ${cell(f.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: `${lines.join("\n")}\n\n_Sorted by last modified._`,
      count: files.length,
      truncated: truncated || !!json.nextPageToken,
    };
  },

  async listSheets(accessToken, spreadsheetId) {
    const params = new URLSearchParams({
      fields: "properties(title),sheets(properties(title,gridProperties(rowCount,columnCount)))",
    });
    const json = await apiGet<{
      properties?: { title?: string };
      sheets?: {
        properties?: {
          title?: string;
          gridProperties?: { rowCount?: number; columnCount?: number };
        };
      }[];
    }>(
      accessToken,
      `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
    );
    return {
      title: json.properties?.title ?? "",
      sheets: (json.sheets ?? []).map((s) => ({
        title: s.properties?.title ?? "",
        rows: s.properties?.gridProperties?.rowCount ?? 0,
        columns: s.properties?.gridProperties?.columnCount ?? 0,
      })),
    };
  },

  async readRange(accessToken, args) {
    const target = Math.min(args.maxRows ?? DEFAULT_MAX_ROWS, HARD_MAX_ROWS);
    const json = await apiGet<{ values?: unknown[][] }>(
      accessToken,
      `${SHEETS_API}/spreadsheets/${encodeURIComponent(
        args.spreadsheetId,
      )}/values/${encodeURIComponent(args.range)}?majorDimension=ROWS`,
    );
    const values = json.values ?? [];
    if (!values.length) {
      return { text: "_The range is empty._", rowCount: 0, truncated: false };
    }
    // First row is treated as the header, the spreadsheet convention.
    const [header, ...rows] = values;
    const width = Math.max(header.length, ...rows.map((r) => r.length), 1);
    const pad = (row: unknown[]) =>
      Array.from({ length: width }, (_, i) => cell(row[i]));
    const lines = [
      `| ${pad(header).join(" | ")} |`,
      `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ];
    let truncated = rows.length > target;
    for (const row of rows.slice(0, target)) {
      lines.push(`| ${pad(row).join(" | ")} |`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: lines.join("\n"),
      rowCount: Math.min(rows.length, target),
      truncated,
    };
  },
};
