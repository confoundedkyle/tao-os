import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Microsoft Excel exposes data ops beyond the shared auth interface; its
// tools import this concrete type.
export interface MicrosoftExcelAdapter extends ConnectorAdapter {
  listWorkbooks(
    accessToken: string,
    args?: { query?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listWorksheets(
    accessToken: string,
    itemId: string,
  ): Promise<{ sheets: { name: string; visibility: string }[] }>;
  readRange(
    accessToken: string,
    args: {
      itemId: string;
      worksheet: string;
      address?: string;
      maxRows?: number;
    },
  ): Promise<{ text: string; rowCount: number; truncated: boolean }>;
}

// Microsoft identity platform OAuth2 (PKCE + client secret) against the
// Graph workbook API. The `common` tenant accepts both work/school and
// personal Microsoft accounts. Graph's /workbook endpoints accept only
// Files.ReadWrite as the least-privileged delegated scope — Files.Read is
// not valid for workbook calls even though we only read. Refresh tokens
// rotate (a new one arrives on every refresh), which getValidAccessToken in
// ./index.ts persists. Workbook discovery uses the Drive search API (Graph
// has no list-workbooks call), filtered client-side to .xlsx/.xlsm since
// search also matches content hits.
const OAUTH_AUTHORIZE =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const OAUTH_TOKEN =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

export const EXCEL_SCOPES = "offline_access Files.ReadWrite User.Read";

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
    throw new Error(`Microsoft token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const detail = json?.error?.message ?? res.statusText;
    throw new Error(`Microsoft Graph request failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

function cell(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function isWorkbook(name?: string): boolean {
  return /\.(xlsx|xlsm)$/i.test(name ?? "");
}

export const microsoftExcelAdapter: MicrosoftExcelAdapter = {
  provider: "microsoft-excel",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.microsoftClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: EXCEL_SCOPES,
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
        client_id: env.microsoftClientId,
        client_secret: env.microsoftClientSecret,
        code_verifier: codeVerifier,
      }),
    );
    // Best-effort account label.
    try {
      const who = await apiGet<{
        mail?: string | null;
        userPrincipalName?: string | null;
      }>(tokens.accessToken, "/me");
      tokens.accountLabel = who.mail ?? who.userPrincipalName ?? undefined;
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
        client_id: env.microsoftClientId,
        client_secret: env.microsoftClientSecret,
      }),
    );
  },

  async listWorkbooks(accessToken, args) {
    const q = (args?.query ?? "xlsx").replace(/'/g, "''");
    const params = new URLSearchParams({
      $top: String((args?.limit ?? DEFAULT_FILES) * 2), // search over-fetches; filtered below
      $select: "id,name,lastModifiedDateTime,parentReference",
    });
    const json = await apiGet<{
      value?: {
        id?: string;
        name?: string;
        lastModifiedDateTime?: string;
        parentReference?: { path?: string };
      }[];
      "@odata.nextLink"?: string;
    }>(accessToken, `/me/drive/root/search(q='${q}')?${params.toString()}`);
    const limit = args?.limit ?? DEFAULT_FILES;
    const files = (json.value ?? []).filter((f) => isWorkbook(f.name));
    if (!files.length) {
      return { text: "_No workbooks found._", count: 0, truncated: false };
    }
    const lines = [
      "| Workbook | Folder | Modified | Item ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = files.length > limit || !!json["@odata.nextLink"];
    for (const f of files.slice(0, limit)) {
      const folder = (f.parentReference?.path ?? "").split("root:").pop() ?? "";
      lines.push(
        `| ${cell(f.name)} | ${cell(folder)} | ${cell(
          (f.lastModifiedDateTime ?? "").slice(0, 10),
        )} | ${cell(f.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: lines.join("\n"),
      count: Math.min(files.length, limit),
      truncated,
    };
  },

  async listWorksheets(accessToken, itemId) {
    const json = await apiGet<{
      value?: { name?: string; visibility?: string }[];
    }>(
      accessToken,
      `/me/drive/items/${encodeURIComponent(itemId)}/workbook/worksheets?$select=name,visibility`,
    );
    return {
      sheets: (json.value ?? []).map((s) => ({
        name: s.name ?? "",
        visibility: s.visibility ?? "",
      })),
    };
  },

  async readRange(accessToken, args) {
    const target = Math.min(args.maxRows ?? DEFAULT_MAX_ROWS, HARD_MAX_ROWS);
    const base = `/me/drive/items/${encodeURIComponent(
      args.itemId,
    )}/workbook/worksheets/${encodeURIComponent(args.worksheet)}`;
    // usedRange trims to cells with content; an explicit address reads a block.
    const path = args.address
      ? `${base}/range(address='${encodeURIComponent(args.address)}')?$select=values`
      : `${base}/usedRange(valuesOnly=true)?$select=values`;
    const json = await apiGet<{ values?: unknown[][] }>(accessToken, path);
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
