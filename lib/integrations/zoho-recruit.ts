import "server-only";
import { env } from "../env";
import type { ConnectorAdapter } from "./types";
import { zohoAuthorizeUrl, zohoPostToken } from "./zoho-crm";

// Zoho Recruit. Same OAuth platform as Zoho CRM (see zoho-crm.ts — one Zoho
// API-console client serves both; this connector just requests Recruit
// scopes). The Recruit API lives on its own host (ZOHO_RECRUIT_API_BASE) with
// the same `Zoho-oauthtoken` auth, v2 modules (Candidates, Job_Openings), and
// 204-for-no-matches search semantics.
export const ZOHO_RECRUIT_SCOPES = "ZohoRecruit.modules.READ";

const DEFAULT_LIMIT = 15;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

type ZohoRecord = Record<string, unknown>;

export interface ZohoRecruitAdapter extends ConnectorAdapter {
  searchCandidates(
    accessToken: string,
    args: { word: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchJobOpenings(
    accessToken: string,
    args: { word: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function search(
  accessToken: string,
  module: string,
  word: string,
  limit: number,
): Promise<ZohoRecord[]> {
  const params = new URLSearchParams({ word, per_page: String(limit) });
  const res = await fetch(
    `${env.zohoRecruitApiBase}/recruit/v2/${module}/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (res.status === 204) return [];
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Zoho Recruit error (${res.status}): ${detail}`);
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

export const zohoRecruitAdapter: ZohoRecruitAdapter = {
  provider: "zoho-recruit",
  authType: "oauth",

  getAuthorizeUrl({ state, redirectUri }) {
    return zohoAuthorizeUrl({ scope: ZOHO_RECRUIT_SCOPES, state, redirectUri });
  },

  async exchangeCode({ code, redirectUri }) {
    const tokens = await zohoPostToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    tokens.accountLabel = "Zoho Recruit";
    return tokens;
  },

  async refreshToken(refreshToken) {
    const tokens = await zohoPostToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    tokens.refreshToken = tokens.refreshToken ?? refreshToken;
    return tokens;
  },

  async searchCandidates(accessToken, args) {
    const guarded = guard(args.word);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const records = await search(accessToken, "Candidates", args.word, limit);
    const rendered = renderTable(
      ["Name", "Email", "Phone", "Title", "City"],
      ["Full_Name", "Email", "Phone", "Current_Job_Title", "City"],
      records,
      "_No candidates found._",
    );
    return { ...rendered, count: records.length };
  },

  async searchJobOpenings(accessToken, args) {
    const guarded = guard(args.word);
    if (guarded) return guarded;
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const records = await search(accessToken, "Job_Openings", args.word, limit);
    const rendered = renderTable(
      ["Job", "Client", "Status", "City", "Openings"],
      ["Posting_Title", "Client_Name", "Job_Opening_Status", "City", "Number_of_Positions"],
      records,
      "_No job openings found._",
    );
    return { ...rendered, count: records.length };
  },
};
