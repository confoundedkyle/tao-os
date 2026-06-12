import "server-only";
import type { ConnectorAdapter } from "./types";

// Snov.io (email finder + verifier). Auth is an OAuth client-credentials
// grant: the stored credential is the user-pasted pair "client-id:secret"
// (Snov.io: account settings → API) exchanged for a 1-hour Bearer token,
// cached in-process and refreshed a minute early. Finder and verifier are
// async by API design: /v2/...:start returns a task_hash, /v2/...:result is
// polled — same pending/poll pattern as the Bright Data and RocketReach
// tools. Profile-by-email is synchronous. Result payload shapes are only
// loosely documented, so parsing is tolerant with a capped raw-JSON fallback.
const API = "https://api.snov.io";

const CHAR_CAP = 8_000;
const TOKEN_SKEW_MS = 60_000;

const CREDENTIAL_HINT =
  'Paste the credential as "client-id:client-secret" — both are shown in Snov.io under your account settings → API.';

export type SnovTaskType = "finder" | "verifier";

export interface SnovAdapter extends ConnectorAdapter {
  findEmail(
    credential: string,
    args: { firstName: string; lastName: string; domain: string },
  ): Promise<{ text: string; pending: boolean }>;
  verifyEmail(
    credential: string,
    args: { email: string },
  ): Promise<{ text: string; pending: boolean }>;
  getTaskResult(
    credential: string,
    args: { type: SnovTaskType; taskHash: string },
  ): Promise<{ text: string; pending: boolean }>;
  getProfileByEmail(
    credential: string,
    args: { email: string },
  ): Promise<{ text: string; found: boolean }>;
}

function parseCredential(
  credential: string,
): { clientId: string; clientSecret: string } | null {
  const i = credential.indexOf(":");
  if (i <= 0 || i === credential.length - 1) return null;
  const clientId = credential.slice(0, i).trim();
  const clientSecret = credential.slice(i + 1).trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// Client-credentials tokens last an hour; cache per client id so agent runs
// don't burn the 60 req/min budget on token exchanges.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(credential: string): Promise<string> {
  const parsed = parseCredential(credential);
  if (!parsed) throw new Error(`Snov.io credential is malformed. ${CREDENTIAL_HINT}`);
  const cached = tokenCache.get(parsed.clientId);
  if (cached && cached.expiresAt - TOKEN_SKEW_MS > Date.now()) return cached.token;
  const res = await fetch(`${API}/v1/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: parsed.clientId,
      client_secret: parsed.clientSecret,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(
      `Snov.io rejected the credentials (${res.status}): ${json?.message ?? "check the client id and secret"}`,
    );
  }
  tokenCache.set(parsed.clientId, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

async function call<T>(
  credential: string,
  method: "GET" | "POST",
  path: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const token = await getToken(credential);
  let url = `${API}${path}`;
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  };
  if (method === "GET" && payload) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(payload))
      if (v !== undefined && v !== "") sp.set(k, String(v));
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  } else if (payload) {
    init.headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify(payload);
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Snov.io error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Tolerant render: known fields first, capped raw JSON as the fallback. */
function renderLoose(value: unknown): string {
  const s = JSON.stringify(value, null, 1) ?? String(value);
  return s.length > CHAR_CAP ? `${s.slice(0, CHAR_CAP)}\n…(truncated)` : s;
}

function isInProgress(payload: unknown): boolean {
  const status = (payload as { status?: string } | null)?.status;
  return status === "in_progress" || status === "pending";
}

function taskHashOf(payload: unknown): string {
  const p = payload as
    | { task_hash?: string; data?: { task_hash?: string } }
    | null;
  return p?.task_hash ?? p?.data?.task_hash ?? "";
}

const RESULT_PATH: Record<SnovTaskType, string> = {
  finder: "/v2/emails-by-domain-by-name/result",
  verifier: "/v2/email-verification/result",
};

async function fetchTaskResult(
  credential: string,
  type: SnovTaskType,
  taskHash: string,
): Promise<{ text: string; pending: boolean }> {
  const json = await call<unknown>(credential, "GET", RESULT_PATH[type], {
    task_hash: taskHash,
  });
  if (isInProgress(json)) {
    return {
      text: `Snov.io is still processing this ${type} task (task hash ${taskHash}). Call snov_get_task_result again after working on something else for a moment.`,
      pending: true,
    };
  }
  return { text: renderLoose(json), pending: false };
}

export const snovAdapter: SnovAdapter = {
  provider: "snov",
  authType: "apikey",

  async validateApiKey(credential) {
    if (!parseCredential(credential)) {
      return { ok: false, message: CREDENTIAL_HINT };
    }
    try {
      await getToken(credential);
      const clientId = parseCredential(credential)?.clientId;
      return { ok: true, accountLabel: `Snov.io (${clientId?.slice(0, 8)}…)` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async findEmail(credential, args) {
    if (!args.firstName || !args.lastName || !args.domain) {
      return { text: "Provide firstName, lastName, and domain.", pending: false };
    }
    const started = await call<unknown>(
      credential,
      "POST",
      "/v2/emails-by-domain-by-name/start",
      {
        rows: [
          {
            first_name: args.firstName,
            last_name: args.lastName,
            domain: args.domain,
          },
        ],
      },
    );
    const taskHash = taskHashOf(started);
    if (!taskHash) return { text: renderLoose(started), pending: false };
    // Often ready immediately — try once before handing back a pending task.
    return fetchTaskResult(credential, "finder", taskHash);
  },

  async verifyEmail(credential, args) {
    if (!args.email) return { text: "Provide an email.", pending: false };
    const started = await call<unknown>(
      credential,
      "POST",
      "/v2/email-verification/start",
      { emails: [args.email] },
    );
    const taskHash = taskHashOf(started);
    if (!taskHash) return { text: renderLoose(started), pending: false };
    return fetchTaskResult(credential, "verifier", taskHash);
  },

  async getTaskResult(credential, args) {
    if (!args.taskHash) return { text: "Provide the taskHash.", pending: false };
    return fetchTaskResult(credential, args.type, args.taskHash);
  },

  async getProfileByEmail(credential, args) {
    if (!args.email) return { text: "Provide an email.", found: false };
    const json = await call<{
      success?: boolean;
      name?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      currentJob?:
        | { companyName?: string | null; position?: string | null }[]
        | null;
      social?: { link?: string | null; type?: string | null }[] | null;
    }>(credential, "POST", "/v1/get-profile-by-email", { email: args.email });
    if (json?.success === false) {
      return { text: "No profile found for that email.", found: false };
    }
    const name =
      json.name ?? [json.firstName, json.lastName].filter(Boolean).join(" ");
    const job = json.currentJob?.[0];
    const social = (json.social ?? [])
      .map((s) => s.link)
      .filter(Boolean)
      .join(", ");
    const headline = [
      `**${name || "Unknown"}**`,
      job?.position ? `— ${job.position}` : "",
      job?.companyName ? `at ${job.companyName}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const detail = [social ? `Profiles: ${social}` : null]
      .filter(Boolean)
      .join("\n");
    if (!name && !job && !social) return { text: renderLoose(json), found: true };
    return { text: `${headline}${detail ? `\n${detail}` : ""}`, found: true };
  },
};
