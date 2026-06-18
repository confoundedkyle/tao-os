import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthApp, OAuthTokens } from "./types";

// Vincere ATS/CRM (REST API v2). Auth is the most involved in the catalog:
// OAuth2 (authorization_code) against the Vincere Identity service yields an
// id_token, access_token and refresh_token. Unlike every other connector the
// API credential is NOT the access_token — each REST call needs TWO headers:
//   • id-token   — the OAuth id_token (lives ~30 min, refreshed via refresh_token)
//   • x-api-key  — the company's per-tenant API key
// and the host is the tenant's own subdomain (e.g. https://acme.vincere.io).
// We persist the id_token as the connection's "access token" (so the shared
// refresh machinery in integrations/index.ts keeps it fresh) and discover the
// tenant host + x-api-key on demand from GET {id}/oauth2/user — exactly how the
// Bullhorn adapter trades its OAuth token for a REST session. The session is
// memoized per id_token (which itself rotates, so the cache self-expires).
//
// Search uses Vincere's Solr-backed endpoint: matrix params live in the path
// after /search/ (fl=<fields>;sort=<field dir>), the query and paging are
// query-string params (q, start, limit). q is a Solr fragment — `field:value`
// clauses joined by `#`, `*` wildcards, `[a TO b]` ranges. id is numeric, so
// `id:[1 TO *]` is the reliable match-all we use to list recent records.
const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;
// id_token lives ~30 min; remember the resolved tenant/key well under that.
const SESSION_TTL_MS = 5 * 60 * 1000;

interface VincereSession {
  /** Tenant API host, scheme included, no trailing slash (https://acme.vincere.io). */
  baseUrl: string;
  apiKey: string;
  expiresAt: number;
}

const sessions = new Map<string, VincereSession>();

interface VincereUser {
  email?: string | null;
  tenants?: { tenant?: string | null; apiKey?: string | null }[] | null;
}

// Search responses wrap rows in a `result` object; field names have varied
// across versions, so pull defensively.
interface VincereSearchResult {
  result?: {
    items?: Record<string, unknown>[] | null;
    content?: Record<string, unknown>[] | null;
    total?: number | null;
    totalElements?: number | null;
  } | null;
  items?: Record<string, unknown>[] | null;
  total?: number | null;
}

export interface VincereAdapter extends ConnectorAdapter {
  searchCandidates(
    idToken: string,
    args?: { query?: string; q?: string; start?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchCompanies(
    idToken: string,
    args?: { query?: string; q?: string; start?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchContacts(
    idToken: string,
    args?: { query?: string; q?: string; start?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  searchApplications(
    idToken: string,
    args?: { q?: string; start?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listTalentPools(
    idToken: string,
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function tokensFromResponse(json: {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): OAuthTokens {
  // The id_token is the API credential, so it becomes the stored access token.
  const idToken = json.id_token ?? json.access_token;
  if (!idToken) throw new Error("Vincere token response had no id_token");
  // Cap the lifetime at the id_token's ~30-min ceiling regardless of expires_in
  // (which describes the access_token) so we refresh before the header expires.
  const ttl = Math.min(json.expires_in ?? 1800, 1800);
  return {
    accessToken: idToken,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function postToken(
  params: Record<string, string>,
  app?: OAuthApp,
): Promise<OAuthTokens> {
  // BYO model: each workspace registers its own Vincere app. Fall back to env
  // for a single-tenant/dev setup if no per-workspace app was supplied.
  const clientId = app?.clientId || env.vincereClientId;
  const clientSecret = app?.clientSecret || env.vincereClientSecret;
  const res = await fetch(`${env.vincereIdBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      // Vincere apps are typically public OAuth clients; send the secret only
      // when one is configured (confidential-client deployments).
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      ...params,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vincere token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

/** Look up the user's first tenant host + API key from the id_token. */
async function fetchUser(idToken: string): Promise<VincereUser> {
  const res = await fetch(`${env.vincereIdBase}/oauth2/user`, {
    headers: { "id-token": idToken, Accept: "application/json" },
  });
  const json = (await res.json().catch(() => null)) as VincereUser | null;
  if (!res.ok || !json) {
    throw new Error(`Vincere /oauth2/user failed (${res.status})`);
  }
  return json;
}

/** Resolve (and briefly cache) the tenant host + x-api-key for an id_token. */
async function resolveSession(idToken: string): Promise<VincereSession> {
  const cached = sessions.get(idToken);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const user = await fetchUser(idToken);
  const tenant = user.tenants?.[0];
  if (!tenant?.tenant || !tenant.apiKey) {
    throw new Error("Vincere account has no tenant with an API key");
  }
  const host = tenant.tenant.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const session: VincereSession = {
    baseUrl: `https://${host}`,
    apiKey: tenant.apiKey,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(idToken, session);
  return session;
}

/** GET a tenant API path (already including any matrix params) with auth. */
async function apiGet<T>(
  idToken: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const session = await resolveSession(idToken);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const url = `${session.baseUrl}/api/v2/${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: {
      "id-token": idToken,
      "x-api-key": session.apiKey,
      Accept: "application/json",
    },
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string; errors?: string[] })
    | null;
  if (!res.ok) {
    sessions.delete(idToken); // id_token may have expired
    const detail = json?.errors?.join(", ") ?? json?.message ?? res.statusText;
    throw new Error(`Vincere ${path} failed (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Run a Vincere Solr search. fl/sort are matrix params baked into the path. */
async function search(
  idToken: string,
  entity: string,
  fields: string,
  args: { q?: string; start?: number; limit?: number },
): Promise<VincereSearchResult> {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
  // Matrix params: spaces in `sort` must be encoded by hand (they precede the ?).
  const matrix = `fl=${fields};sort=created_date desc`.replace(/ /g, "%20");
  return apiGet<VincereSearchResult>(idToken, `${entity}/search/${matrix}`, {
    q: args.q || "id:[1 TO *]",
    start: args.start ?? 0,
    limit,
  });
}

/** Build the Solr q clause from a keyword (prefix match on the name field). */
function nameQuery(query?: string, raw?: string): string | undefined {
  if (raw) return raw;
  const term = query?.trim();
  if (!term) return undefined;
  // Escape Solr specials, then prefix-match the name field.
  const escaped = term.replace(/[+\-&|!(){}[\]^"~*?:\\/#]/g, " ").trim();
  return escaped ? `name:${escaped}*` : undefined;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function field(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function rowsOf(json: VincereSearchResult): Record<string, unknown>[] {
  return (
    json.result?.items ??
    json.result?.content ??
    json.items ??
    []
  );
}

function totalOf(json: VincereSearchResult, fallback: number): number {
  return (
    json.result?.total ??
    json.result?.totalElements ??
    json.total ??
    fallback
  );
}

function render(
  header: string[],
  rows: string[][],
  total: number,
  start: number,
  emptyText: string,
  noun: string,
): { text: string; count: number; truncated: boolean } {
  if (!rows.length) return { text: emptyText, count: 0, truncated: false };
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  let truncated = false;
  let shown = 0;
  for (const row of rows) {
    lines.push(`| ${row.map(cell).join(" | ")} |`);
    shown += 1;
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return {
    text: `${lines.join("\n")}\n\n_${total} total ${noun} — page with start._`,
    count: shown,
    truncated: truncated || total > start + rows.length,
  };
}

const CANDIDATE_FIELDS =
  "id,name,first_name,last_name,email,phone,mobile,current_job_title,current_employer,current_location,created_date";
const COMPANY_FIELDS =
  "id,name,industry,website,phone,location_name,city,country,created_date";
const CONTACT_FIELDS =
  "id,name,first_name,last_name,email,phone,mobile,job_title,company_name,created_date";
const APPLICATION_FIELDS =
  "id,candidate_id,candidate_name,job_id,job_title,stage,status,created_date";

function personName(row: Record<string, unknown>): string {
  const name = field(row, "name");
  if (name) return name;
  return [field(row, "first_name"), field(row, "last_name")]
    .filter(Boolean)
    .join(" ");
}

export const vincereAdapter: VincereAdapter = {
  provider: "vincere",
  authType: "oauth",

  getAuthorizeUrl({ state, redirectUri, app }) {
    const params = new URLSearchParams({
      client_id: app?.clientId || env.vincereClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    return `${env.vincereIdBase}/oauth2/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri, app }) {
    const tokens = await postToken(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
      app,
    );
    // Best-effort label: the tenant host identifies the Vincere instance.
    try {
      const user = await fetchUser(tokens.accessToken);
      const host = user.tenants?.[0]?.tenant
        ?.replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      if (host) tokens.accountLabel = `Vincere (${host.split(".")[0]})`;
    } catch {
      // Non-fatal — leave the label unset.
    }
    return tokens;
  },

  async refreshToken(refreshToken, app) {
    return postToken(
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      app,
    );
  },

  async searchCandidates(idToken, args) {
    const json = await search(idToken, "candidate", CANDIDATE_FIELDS, {
      q: nameQuery(args?.query, args?.q),
      start: args?.start,
      limit: args?.limit,
    });
    const rows = rowsOf(json).map((r) => [
      personName(r),
      field(r, "email"),
      field(r, "mobile", "phone"),
      field(r, "current_job_title"),
      field(r, "current_employer"),
      field(r, "current_location"),
      field(r, "id"),
    ]);
    return render(
      ["Name", "Email", "Phone", "Title", "Company", "Location", "Candidate ID"],
      rows,
      totalOf(json, rows.length),
      args?.start ?? 0,
      "_No candidates found._",
      "matches",
    );
  },

  async searchCompanies(idToken, args) {
    const json = await search(idToken, "company", COMPANY_FIELDS, {
      q: nameQuery(args?.query, args?.q),
      start: args?.start,
      limit: args?.limit,
    });
    const rows = rowsOf(json).map((r) => [
      field(r, "name"),
      field(r, "industry"),
      field(r, "website"),
      field(r, "phone"),
      [field(r, "city"), field(r, "country")].filter(Boolean).join(", ") ||
        field(r, "location_name"),
      field(r, "id"),
    ]);
    return render(
      ["Company", "Industry", "Website", "Phone", "Location", "Company ID"],
      rows,
      totalOf(json, rows.length),
      args?.start ?? 0,
      "_No companies found._",
      "companies",
    );
  },

  async searchContacts(idToken, args) {
    const json = await search(idToken, "contact", CONTACT_FIELDS, {
      q: nameQuery(args?.query, args?.q),
      start: args?.start,
      limit: args?.limit,
    });
    const rows = rowsOf(json).map((r) => [
      personName(r),
      field(r, "email"),
      field(r, "mobile", "phone"),
      field(r, "job_title"),
      field(r, "company_name"),
      field(r, "id"),
    ]);
    return render(
      ["Name", "Email", "Phone", "Title", "Company", "Contact ID"],
      rows,
      totalOf(json, rows.length),
      args?.start ?? 0,
      "_No contacts found._",
      "matches",
    );
  },

  async searchApplications(idToken, args) {
    const json = await search(idToken, "application", APPLICATION_FIELDS, {
      q: args?.q,
      start: args?.start,
      limit: args?.limit,
    });
    const rows = rowsOf(json).map((r) => [
      field(r, "candidate_name", "candidate_id"),
      field(r, "job_title", "job_id"),
      field(r, "stage"),
      field(r, "status"),
      field(r, "created_date").slice(0, 10),
      field(r, "id"),
    ]);
    return render(
      ["Candidate", "Job", "Stage", "Status", "Created", "Application ID"],
      rows,
      totalOf(json, rows.length),
      args?.start ?? 0,
      "_No applications found._",
      "applications",
    );
  },

  async listTalentPools(idToken) {
    // Talent pools are a small fixed list, not a search core — plain GET.
    const json = await apiGet<
      Record<string, unknown>[] | { data?: Record<string, unknown>[] | null }
    >(idToken, "talentpool");
    const pools = Array.isArray(json) ? json : (json.data ?? []);
    if (!pools.length) {
      return { text: "_No talent pools found._", count: 0, truncated: false };
    }
    const lines = [
      "| Talent pool | Description | Candidates | Pool ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of pools) {
      lines.push(
        `| ${cell(field(p, "name"))} | ${cell(field(p, "description"))} | ${cell(
          field(p, "candidate_count", "total_candidates"),
        )} | ${cell(field(p, "id"))} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: `${lines.join("\n")}\n\n_${pools.length} talent pools._`,
      count: pools.length,
      truncated,
    };
  },
};
