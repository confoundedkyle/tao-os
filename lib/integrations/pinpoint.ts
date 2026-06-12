import "server-only";
import type { ConnectorAdapter } from "./types";

// Pinpoint ATS. Auth is an API key (Pinpoint: Company settings → API keys)
// sent as an X-API-KEY header, but the API lives on each org's own subdomain
// ({org}.pinpointhq.com/api/v1) and no endpoint reveals it — so, like Loxo
// and Recruitee, the stored credential is the user-pasted "subdomain:api-key"
// pair, taught by the validation error. Responses are JSON:API; attribute
// casing is handled defensively (snake_case with kebab-case fallback). Only
// the documented list surface is wrapped — no speculative filters.
const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const CHAR_CAP = 12_000;

const CREDENTIAL_HINT =
  'Paste the credential as "subdomain:api-key" — the subdomain is your Pinpoint URL ({subdomain}.pinpointhq.com), and keys are created under Company settings → API keys.';

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface JsonApiList {
  data?: JsonApiResource[];
  links?: { next?: string | null };
  meta?: { stats?: { total?: { count?: number } } };
}

export interface PinpointAdapter extends ConnectorAdapter {
  listJobs(
    credential: string,
    args?: { page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listCandidates(
    credential: string,
    args?: { page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function parseCredential(
  credential: string,
): { subdomain: string; key: string } | null {
  const i = credential.indexOf(":");
  if (i <= 0 || i === credential.length - 1) return null;
  const subdomain = credential.slice(0, i).trim();
  const key = credential.slice(i + 1).trim();
  if (!subdomain || !key || /[^a-z0-9-]/i.test(subdomain)) return null;
  return { subdomain, key };
}

async function get<T>(
  credential: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const parsed = parseCredential(credential);
  if (!parsed)
    throw new Error(`Pinpoint credential is malformed. ${CREDENTIAL_HINT}`);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(
    `https://${parsed.subdomain}.pinpointhq.com/api/v1${path}${qs ? `?${qs}` : ""}`,
    {
      headers: { "X-API-KEY": parsed.key, Accept: "application/vnd.api+json" },
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { errors?: { detail?: string; title?: string }[] } | null)
        ?.errors?.[0]?.detail ??
      (json as { errors?: { title?: string }[] } | null)?.errors?.[0]?.title ??
      res.statusText;
    throw new Error(`Pinpoint error (${res.status}): ${detail}`);
  }
  return json as T;
}

/** Pinpoint attributes are snake_case; fall back to kebab-case defensively. */
function attr(r: JsonApiResource, ...keys: string[]): string {
  for (const key of keys) {
    for (const variant of [key, key.replace(/_/g, "-")]) {
      const v = r.attributes?.[variant];
      if (v != null && typeof v !== "object") return String(v);
    }
  }
  return "";
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const pinpointAdapter: PinpointAdapter = {
  provider: "pinpoint",
  authType: "apikey",

  async validateApiKey(credential) {
    if (!parseCredential(credential)) {
      return { ok: false, message: CREDENTIAL_HINT };
    }
    try {
      await get<unknown>(credential, "/jobs", { "page[size]": 1 });
      const subdomain = parseCredential(credential)?.subdomain;
      return { ok: true, accountLabel: `Pinpoint (${subdomain})` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(credential, args) {
    const limit = Math.min(args?.limit ?? PAGE_DEFAULT, PAGE_MAX);
    const json = await get<JsonApiList>(credential, "/jobs", {
      "page[size]": limit,
      "page[number]": args?.page,
    });
    const jobs = json.data ?? [];
    const lines = [
      "| Job | Status | Visibility | Workplace | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const j of jobs) {
      lines.push(
        `| ${cell(attr(j, "title"))} | ${cell(attr(j, "status"))} | ${cell(
          attr(j, "visibility"),
        )} | ${cell(attr(j, "workplace_type", "location"))} | ${j.id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: jobs.length ? lines.join("\n") : "_No jobs._",
      count: jobs.length,
      truncated: truncated || !!json.links?.next,
    };
  },

  async listCandidates(credential, args) {
    const limit = Math.min(args?.limit ?? PAGE_DEFAULT, PAGE_MAX);
    const json = await get<JsonApiList>(credential, "/candidates", {
      "page[size]": limit,
      "page[number]": args?.page,
    });
    const candidates = json.data ?? [];
    const lines = [
      "| Name | Email | Phone | Candidate ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of candidates) {
      const name =
        [attr(c, "first_name"), attr(c, "last_name")]
          .filter(Boolean)
          .join(" ") || attr(c, "name");
      lines.push(
        `| ${cell(name)} | ${cell(attr(c, "email"))} | ${cell(
          attr(c, "phone"),
        )} | ${c.id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: candidates.length ? lines.join("\n") : "_No candidates._",
      count: candidates.length,
      truncated: truncated || !!json.links?.next,
    };
  },
};
