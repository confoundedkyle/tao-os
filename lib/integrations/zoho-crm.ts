import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Zoho CRM. OAuth2 only — Zoho issues no static API keys. The operator
// registers a client in the Zoho API console and sets ZOHO_CLIENT_ID/SECRET;
// one deployment targets one Zoho data center (ZOHO_ACCOUNTS_BASE /
// ZOHO_API_BASE, defaulting to the US DC). Zoho doesn't use PKCE — the
// adapter's codeChallenge/codeVerifier args are ignored; state still guards
// CSRF. Refresh tokens are permanent (not rotated); access tokens last 1h.
// API auth header is `Zoho-oauthtoken <token>`. Search endpoints require an
// explicit fields list.
export const ZOHO_CRM_SCOPES = "ZohoCRM.modules.READ";

const DEFAULT_LIMIT = 15;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

type ZohoRecord = Record<string, unknown>;

export interface ZohoCrmAdapter extends ConnectorAdapter {
  searchContacts(
    accessToken: string,
    args: { word: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchAccounts(
    accessToken: string,
    args: { word: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchDeals(
    accessToken: string,
    args: { word: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function tokensFromResponse(json: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}): OAuthTokens {
  if (!json.access_token) {
    throw new Error(`Zoho token exchange failed: ${json.error ?? "no token"}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    scopes: json.scope,
  };
}

export async function zohoPostToken(
  params: Record<string, string>,
): Promise<OAuthTokens> {
  const res = await fetch(`${env.zohoAccountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.zohoClientId,
      client_secret: env.zohoClientSecret,
      ...params,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Zoho token exchange failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return tokensFromResponse(json);
}

export function zohoAuthorizeUrl(args: {
  scope: string;
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: env.zohoClientId,
    response_type: "code",
    scope: args.scope,
    redirect_uri: args.redirectUri,
    state: args.state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${env.zohoAccountsBase}/oauth/v2/auth?${params.toString()}`;
}

async function search(
  accessToken: string,
  module: string,
  word: string,
  fields: string[],
  limit: number,
): Promise<ZohoRecord[]> {
  const params = new URLSearchParams({
    word,
    fields: fields.join(","),
    per_page: String(limit),
  });
  const res = await fetch(
    `${env.zohoApiBase}/crm/v2/${module}/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (res.status === 204) return []; // Zoho returns 204 for no matches
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Zoho CRM error (${res.status}): ${detail}`);
  }
  return ((json as { data?: ZohoRecord[] } | null)?.data ?? []) as ZohoRecord[];
}

function cell(v: unknown): string {
  if (v == null) return "";
  const s =
    typeof v === "object"
      ? String((v as { name?: unknown }).name ?? "")
      : String(v);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderTable(
  header: string[],
  fieldNames: string[],
  records: ZohoRecord[],
  emptyText: string,
): { text: string; truncated: boolean } {
  if (records.length === 0) return { text: emptyText, truncated: false };
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  let truncated = false;
  for (const r of records) {
    lines.push(`| ${fieldNames.map((f) => cell(r[f])).join(" | ")} |`);
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

function guard(word: string) {
  if (!word || word.trim().length < 2) {
    return {
      text: "Provide a search word of at least 2 characters.",
      count: 0,
      truncated: false,
    };
  }
  return null;
}

export const zohoCrmAdapter: ZohoCrmAdapter = {
  provider: "zoho-crm",
  authType: "oauth",

  getAuthorizeUrl({ state, redirectUri }) {
    return zohoAuthorizeUrl({ scope: ZOHO_CRM_SCOPES, state, redirectUri });
  },

  async exchangeCode({ code, redirectUri }) {
    const tokens = await zohoPostToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    tokens.accountLabel = "Zoho CRM";
    return tokens;
  },

  async refreshToken(refreshToken) {
    const tokens = await zohoPostToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    // Zoho refresh tokens are permanent and not returned on refresh; keep ours.
    tokens.refreshToken = tokens.refreshToken ?? refreshToken;
    return tokens;
  },

  async searchContacts(accessToken, args) {
    const guarded = guard(args.word);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const records = await search(
      accessToken,
      "Contacts",
      args.word,
      ["Full_Name", "Email", "Phone", "Account_Name", "Title"],
      limit,
    );
    const rendered = renderTable(
      ["Name", "Email", "Phone", "Account", "Title"],
      ["Full_Name", "Email", "Phone", "Account_Name", "Title"],
      records,
      "_No contacts found._",
    );
    return { ...rendered, count: records.length };
  },

  async searchAccounts(accessToken, args) {
    const guarded = guard(args.word);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const records = await search(
      accessToken,
      "Accounts",
      args.word,
      ["Account_Name", "Website", "Industry", "Billing_City", "Billing_Country"],
      limit,
    );
    const rendered = renderTable(
      ["Account", "Website", "Industry", "City", "Country"],
      ["Account_Name", "Website", "Industry", "Billing_City", "Billing_Country"],
      records,
      "_No accounts found._",
    );
    return { ...rendered, count: records.length };
  },

  async searchDeals(accessToken, args) {
    const guarded = guard(args.word);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const records = await search(
      accessToken,
      "Deals",
      args.word,
      ["Deal_Name", "Amount", "Stage", "Account_Name", "Closing_Date"],
      limit,
    );
    const rendered = renderTable(
      ["Deal", "Amount", "Stage", "Account", "Closing"],
      ["Deal_Name", "Amount", "Stage", "Account_Name", "Closing_Date"],
      records,
      "_No deals found._",
    );
    return { ...rendered, count: records.length };
  },
};
