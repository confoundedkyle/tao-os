import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Bullhorn exposes data ops beyond the shared auth interface; its tools
// import this concrete type.
export interface BullhornAdapter extends ConnectorAdapter {
  listJobs(
    accessToken: string,
    args?: { title?: string; openOnly?: boolean; start?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCandidates(
    accessToken: string,
    args?: {
      name?: string;
      email?: string;
      query?: string;
      start?: number;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listJobSubmissions(
    accessToken: string,
    args: { jobId: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

// Bullhorn OAuth2 + REST. Two-step auth: the OAuth access token (TTL ~10
// minutes; refresh tokens are single-use and rotate) is not itself an API
// credential — each REST session starts with GET /rest-services/login, which
// trades the access token for an ephemeral BhRestToken plus the per-corp
// restUrl (Bullhorn is sharded into regional "swimlanes"). The adapter does
// that login per operation, memoized briefly per access token, since only
// the OAuth pair is persisted. Bullhorn has no PKCE — the codeChallenge /
// codeVerifier args are ignored; state still guards CSRF. Search endpoints
// take Lucene queries with an explicit fields list and count/start paging.
const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;
// BhRestToken sessions idle out after ~10 minutes; remember them well under that.
const REST_SESSION_TTL_MS = 5 * 60 * 1000;

interface BullhornRestSession {
  bhRestToken: string;
  restUrl: string;
  expiresAt: number;
}

const restSessions = new Map<string, BullhornRestSession>();

export interface BullhornJob {
  id?: number;
  title?: string | null;
  clientCorporation?: { name?: string | null } | null;
  status?: string | null;
  employmentType?: string | null;
  isOpen?: boolean | null;
  dateAdded?: number | null;
}

export interface BullhornCandidate {
  id?: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  occupation?: string | null;
  companyName?: string | null;
  status?: string | null;
  address?: { city?: string | null; state?: string | null } | null;
}

interface BullhornSubmission {
  id?: number;
  status?: string | null;
  dateAdded?: number | null;
  candidate?: BullhornCandidate | null;
}

interface BullhornSearchResult<T> {
  total?: number;
  data?: T[] | null;
}

function tokensFromResponse(json: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): OAuthTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
  };
}

async function postToken(params: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(`${env.bullhornAuthBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.bullhornClientId,
      client_secret: env.bullhornClientSecret,
      ...params,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Bullhorn token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

/** Trade the OAuth access token for a REST session (BhRestToken + restUrl). */
async function restLogin(accessToken: string): Promise<BullhornRestSession> {
  const cached = restSessions.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const res = await fetch(
    `${env.bullhornRestLoginBase}/rest-services/login?version=2.0&access_token=${encodeURIComponent(accessToken)}`,
  );
  const json = (await res.json().catch(() => null)) as {
    BhRestToken?: string;
    restUrl?: string;
    errorMessage?: string;
  } | null;
  if (!res.ok || !json?.BhRestToken || !json.restUrl) {
    throw new Error(
      `Bullhorn REST login failed (${res.status}): ${json?.errorMessage ?? "no session returned"}`,
    );
  }
  const session: BullhornRestSession = {
    bhRestToken: json.BhRestToken,
    restUrl: json.restUrl.replace(/\/$/, ""),
    expiresAt: Date.now() + REST_SESSION_TTL_MS,
  };
  restSessions.set(accessToken, session);
  return session;
}

async function restGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const session = await restLogin(accessToken);
  const sp = new URLSearchParams({ BhRestToken: session.bhRestToken });
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const res = await fetch(`${session.restUrl}/${path}?${sp.toString()}`);
  const json = (await res.json().catch(() => null)) as
    | (T & { errorMessage?: string })
    | null;
  if (!res.ok || json?.errorMessage) {
    restSessions.delete(accessToken); // session may have idled out
    throw new Error(
      `Bullhorn API ${path} failed (${res.status}): ${json?.errorMessage ?? res.statusText}`,
    );
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function day(ms?: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

/** Quote a user-supplied value for a Lucene field query. */
function luceneQuote(value: string): string {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

function candidateRow(c: BullhornCandidate, stage?: string | null): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const location = [c.address?.city, c.address?.state].filter(Boolean).join(", ");
  const cols = [
    cell(name),
    cell(c.email),
    cell(c.mobile ?? c.phone),
    cell(c.occupation),
    cell(c.companyName),
    cell(location),
    cell(stage !== undefined ? stage : c.status),
    cell(c.id),
  ];
  return `| ${cols.join(" | ")} |`;
}

const CANDIDATE_HEADER = [
  "| Name | Email | Phone | Title | Company | Location | Status | Candidate ID |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];

export const bullhornAdapter: BullhornAdapter = {
  provider: "bullhorn",
  authType: "oauth",

  getAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.bullhornClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    return `${env.bullhornAuthBase}/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const tokens = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    // Best-effort account label: the restUrl encodes the corp's swimlane.
    try {
      const session = await restLogin(tokens.accessToken);
      const host = new URL(session.restUrl).host;
      tokens.accountLabel = `Bullhorn (${host.split(".")[0]})`;
    } catch {
      // Non-fatal — leave the label unset.
    }
    return tokens;
  },

  async refreshToken(refreshToken) {
    return postToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  },

  async listJobs(accessToken, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const query = [
      "isDeleted:0",
      args?.openOnly ? "isOpen:1" : "",
      args?.title ? `title:${luceneQuote(args.title)}` : "",
    ]
      .filter(Boolean)
      .join(" AND ");
    const json = await restGet<BullhornSearchResult<BullhornJob>>(
      accessToken,
      "search/JobOrder",
      {
        query,
        fields:
          "id,title,clientCorporation(name),status,employmentType,isOpen,dateAdded",
        sort: "-dateAdded",
        count: limit,
        start: args?.start ?? 0,
      },
    );
    const jobs = json.data ?? [];
    if (!jobs.length) {
      return { text: "_No jobs found._", count: 0, truncated: false };
    }
    const lines = [
      "| Job | Client | Status | Type | Open | Added | Job ID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(j.title)} | ${cell(j.clientCorporation?.name)} | ${cell(
          j.status,
        )} | ${cell(j.employmentType)} | ${j.isOpen ? "yes" : "no"} | ${cell(
          day(j.dateAdded),
        )} | ${j.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.total ?? jobs.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total jobs — page with start._`,
      count: jobs.length,
      truncated: truncated || total > (args?.start ?? 0) + jobs.length,
    };
  },

  async searchCandidates(accessToken, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const query = [
      "isDeleted:0",
      args?.name ? `name:${luceneQuote(args.name)}` : "",
      args?.email ? `email:${luceneQuote(args.email)}` : "",
      args?.query ? `(${args.query})` : "",
    ]
      .filter(Boolean)
      .join(" AND ");
    const json = await restGet<BullhornSearchResult<BullhornCandidate>>(
      accessToken,
      "search/Candidate",
      {
        query,
        fields:
          "id,firstName,lastName,email,phone,mobile,occupation,companyName,status,address(city,state)",
        sort: "-dateAdded",
        count: limit,
        start: args?.start ?? 0,
      },
    );
    const candidates = json.data ?? [];
    if (!candidates.length) {
      return { text: "_No candidates found._", count: 0, truncated: false };
    }
    const lines = [...CANDIDATE_HEADER];
    let truncated = false;
    for (const c of candidates) {
      lines.push(candidateRow(c));
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.total ?? candidates.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total matches — page with start._`,
      count: candidates.length,
      truncated: truncated || total > (args?.start ?? 0) + candidates.length,
    };
  },

  async listJobSubmissions(accessToken, args) {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await restGet<BullhornSearchResult<BullhornSubmission>>(
      accessToken,
      "search/JobSubmission",
      {
        query: `jobOrder.id:${args.jobId} AND isDeleted:0`,
        fields:
          "id,status,dateAdded,candidate(id,firstName,lastName,email,phone,mobile,occupation,companyName,address(city,state))",
        sort: "-dateAdded",
        count: limit,
      },
    );
    const subs = json.data ?? [];
    if (!subs.length) {
      return { text: "_No submissions for this job._", count: 0, truncated: false };
    }
    const lines = [...CANDIDATE_HEADER];
    let truncated = false;
    for (const s of subs) {
      lines.push(candidateRow(s.candidate ?? {}, s.status));
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.total ?? subs.length;
    return {
      text: `${lines.join("\n")}\n\n_${total} total submissions._`,
      count: subs.length,
      truncated: truncated || total > subs.length,
    };
  },
};
