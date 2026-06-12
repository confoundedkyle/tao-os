import "server-only";
import type { ConnectorAdapter } from "./types";

// Recruitee ATS. Auth is a personal API token (Settings → Apps and plugins →
// Personal API tokens) sent as a Bearer header, but every endpoint is scoped
// by a numeric company id shown next to the token — and no endpoint reveals
// it. So, like Loxo, the stored credential is the user-pasted pair
// "company-id:token" and validateApiKey teaches the format on miss. Jobs are
// "offers"; candidates support offer_id (pipeline) and query (search)
// filters with limit/offset paging.
const API = "https://api.recruitee.com/c";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

const CREDENTIAL_HINT =
  'Paste the credential as "company-id:token" — both are shown in Recruitee under Settings → Apps and plugins → Personal API tokens (the company ID is the number next to your token).';

export interface RecruiteeOffer {
  id?: number;
  title?: string | null;
  status?: string | null;
  department?: string | null;
  city?: string | null;
  country_code?: string | null;
}

export interface RecruiteeCandidate {
  id?: number;
  name?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  positions?: string[] | null;
}

export interface RecruiteeAdapter extends ConnectorAdapter {
  listOffers(
    credential: string,
    args?: { limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    credential: string,
    args?: { query?: string; offerId?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function parseCredential(
  credential: string,
): { companyId: string; token: string } | null {
  const i = credential.indexOf(":");
  if (i <= 0 || i === credential.length - 1) return null;
  const companyId = credential.slice(0, i).trim();
  const token = credential.slice(i + 1).trim();
  if (!companyId || !token || !/^\d+$/.test(companyId)) return null;
  return { companyId, token };
}

async function get<T>(
  credential: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const parsed = parseCredential(credential);
  if (!parsed)
    throw new Error(`Recruitee credential is malformed. ${CREDENTIAL_HINT}`);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(
    `${API}/${parsed.companyId}${path}${qs ? `?${qs}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${parsed.token}`,
        Accept: "application/json",
      },
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string[] | string } | null)?.error?.toString() ??
      res.statusText;
    throw new Error(`Recruitee error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const recruiteeAdapter: RecruiteeAdapter = {
  provider: "recruitee",
  authType: "apikey",

  async validateApiKey(credential) {
    if (!parseCredential(credential)) {
      return { ok: false, message: CREDENTIAL_HINT };
    }
    try {
      await get<unknown>(credential, "/offers", { limit: 1 });
      const companyId = parseCredential(credential)?.companyId;
      return { ok: true, accountLabel: `Recruitee (${companyId})` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listOffers(credential, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{ offers?: RecruiteeOffer[] }>(
      credential,
      "/offers",
      { limit },
    );
    const offers = json.offers ?? [];
    const lines = [
      "| Job | Status | Department | Location | Offer ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const o of offers) {
      const location = [o.city, o.country_code].filter(Boolean).join(", ");
      lines.push(
        `| ${cell(o.title)} | ${cell(o.status)} | ${cell(o.department)} | ${cell(
          location,
        )} | ${o.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: offers.length ? lines.join("\n") : "_No jobs._",
      count: offers.length,
      truncated: truncated || offers.length === limit,
    };
  },

  async listCandidates(credential, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{ candidates?: RecruiteeCandidate[] }>(
      credential,
      "/candidates",
      { limit, query: args?.query, offer_id: args?.offerId },
    );
    const candidates = json.candidates ?? [];
    const lines = [
      "| Name | Email | Phone | Positions | Candidate ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      lines.push(
        `| ${cell(c.name)} | ${cell(c.emails?.[0])} | ${cell(
          c.phones?.[0],
        )} | ${cell((c.positions ?? []).join("; "))} | ${c.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: candidates.length ? lines.join("\n") : "_No candidates._",
      count: candidates.length,
      truncated: truncated || candidates.length === limit,
    };
  },
};
