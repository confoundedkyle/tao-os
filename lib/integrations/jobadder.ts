import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// JobAdder exposes data ops beyond the shared auth interface; its tools
// import this concrete type.
export interface JobAdderAdapter extends ConnectorAdapter {
  listJobs(
    accessToken: string,
    args?: { title?: string; activeOnly?: boolean; offset?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    accessToken: string,
    args?: {
      name?: string;
      email?: string;
      keywords?: string;
      offset?: number;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listJobApplications(
    accessToken: string,
    args: { jobId: number; activeOnly?: boolean; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

// JobAdder OAuth2 (IdentityServer at id.jobadder.com). Confidential client:
// code exchange and refresh both carry the client secret; PKCE rides along
// for clients configured to require it. Scope `read offline_access` keeps
// the grant read-only; access tokens last ~60 minutes. The token response
// carries an `api` base URL — today the global https://api.jobadder.com/v2,
// which fronts JobAdder's regional shards, so the adapter targets it
// directly rather than persisting a per-connection base.
const OAUTH_AUTHORIZE = "https://id.jobadder.com/connect/authorize";
const OAUTH_TOKEN = "https://id.jobadder.com/connect/token";
const API = "https://api.jobadder.com/v2";

export const JOBADDER_SCOPES = "read offline_access";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

interface JobAdderName {
  name?: string | null;
}

export interface JobAdderJob {
  jobId?: number;
  jobTitle?: string | null;
  company?: JobAdderName | null;
  contact?: { firstName?: string | null; lastName?: string | null } | null;
  status?: JobAdderName | null;
  createdAt?: string | null;
}

export interface JobAdderCandidate {
  candidateId?: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  address?: { city?: string | null; state?: string | null } | null;
  status?: JobAdderName | null;
  source?: string | null;
}

interface JobAdderApplication {
  applicationId?: number;
  jobTitle?: string | null;
  status?: JobAdderName | null;
  candidate?: JobAdderCandidate | null;
}

interface JobAdderList<T> {
  items?: T[] | null;
  totalCount?: number | null;
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`JobAdder token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

async function apiGet<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`JobAdder API ${path} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function candidateRows(
  candidates: JobAdderCandidate[],
  extra?: (c: JobAdderCandidate) => string[],
): string[] {
  return candidates.map((c) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
    const location = [c.address?.city, c.address?.state].filter(Boolean).join(", ");
    const cols = [
      cell(name),
      cell(c.email),
      cell(c.mobile ?? c.phone),
      cell(location),
      ...(extra ? extra(c) : [cell(c.status?.name), cell(c.candidateId)]),
    ];
    return `| ${cols.join(" | ")} |`;
  });
}

export const jobadderAdapter: JobAdderAdapter = {
  provider: "jobadder",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.jobadderClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: JOBADDER_SCOPES,
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
        client_id: env.jobadderClientId,
        client_secret: env.jobadderClientSecret,
        code_verifier: codeVerifier,
      }),
    );
    // Best-effort account label.
    try {
      const who = await apiGet<{ email?: string | null }>(
        tokens.accessToken,
        "/users/current",
      );
      tokens.accountLabel = who.email ?? undefined;
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
        client_id: env.jobadderClientId,
        client_secret: env.jobadderClientSecret,
      }),
    );
  },

  async listJobs(accessToken, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await apiGet<JobAdderList<JobAdderJob>>(accessToken, "/jobs", {
      jobTitle: args?.title,
      active: args?.activeOnly ? true : undefined,
      offset: args?.offset ?? 0,
      limit,
    });
    const jobs = json.items ?? [];
    if (!jobs.length) {
      return { text: "_No jobs found._", count: 0, truncated: false };
    }
    const lines = [
      "| Job | Company | Contact | Status | Created | Job ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      const contact = [j.contact?.firstName, j.contact?.lastName]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `| ${cell(j.jobTitle)} | ${cell(j.company?.name)} | ${cell(contact)} | ${cell(
          j.status?.name,
        )} | ${cell((j.createdAt ?? "").slice(0, 10))} | ${j.jobId ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.totalCount ?? jobs.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total jobs — page with offset._`,
      count: jobs.length,
      truncated: truncated || total > (args?.offset ?? 0) + jobs.length,
    };
  },

  async searchCandidates(accessToken, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await apiGet<JobAdderList<JobAdderCandidate>>(
      accessToken,
      "/candidates",
      {
        name: args?.name,
        email: args?.email,
        keywords: args?.keywords,
        offset: args?.offset ?? 0,
        limit,
      },
    );
    const candidates = json.items ?? [];
    if (!candidates.length) {
      return { text: "_No candidates found._", count: 0, truncated: false };
    }
    const lines = [
      "| Name | Email | Phone | Location | Status | Candidate ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const row of candidateRows(candidates)) {
      lines.push(row);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.totalCount ?? candidates.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total matches — page with offset._`,
      count: candidates.length,
      truncated: truncated || total > (args?.offset ?? 0) + candidates.length,
    };
  },

  async listJobApplications(accessToken, args) {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const path = args.activeOnly
      ? `/jobs/${encodeURIComponent(String(args.jobId))}/applications/active`
      : `/jobs/${encodeURIComponent(String(args.jobId))}/applications`;
    const json = await apiGet<JobAdderList<JobAdderApplication>>(
      accessToken,
      path,
      { limit },
    );
    const apps = json.items ?? [];
    if (!apps.length) {
      return { text: "_No applications for this job._", count: 0, truncated: false };
    }
    const lines = [
      "| Name | Email | Phone | Location | Stage | Candidate ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const a of apps) {
      const c = a.candidate ?? {};
      const [row] = candidateRows([c], () => [
        cell(a.status?.name),
        cell(c.candidateId),
      ]);
      lines.push(row);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.totalCount ?? apps.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total applications._`,
      count: apps.length,
      truncated: truncated || total > apps.length,
    };
  },
};
