import "server-only";
import type { ConnectorAdapter } from "./types";

// BambooHR ATS (Applicant Tracking API). Auth is a per-user API key (BambooHR:
// avatar menu → API Keys) sent as the Basic-auth username with "x" as the
// password — but every endpoint lives under the account's company domain
// (the {company} in {company}.bamboohr.com), and no endpoint reveals it. So,
// like Recruitee, the stored credential is the user-pasted pair
// "company-domain:key" and validateApiKey teaches the format on miss. The
// applications endpoint filters by jobId (one role's pipeline) and
// searchString (applicant name); paging is page-based with a
// paginationComplete flag. ATS field shapes vary across accounts (labels can
// be strings or {label} objects), so rendering parses both.
const GATEWAY = "https://api.bamboohr.com/api/gateway.php";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

const CREDENTIAL_HINT =
  'Paste the credential as "company-domain:api-key" — the company domain is the {company} part of {company}.bamboohr.com, and the key comes from your BambooHR avatar menu → API Keys (the key owner needs ATS access).';

type Labeled = string | { label?: string | null } | null | undefined;

export interface BambooHRJob {
  id?: number | string;
  title?: Labeled;
  status?: Labeled;
  department?: Labeled;
  location?: Labeled;
  postedDate?: string | null;
}

export interface BambooHRApplication {
  id?: number | string;
  appliedDate?: string | null;
  status?: Labeled;
  rating?: number | null;
  applicant?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  } | null;
  job?: { id?: number | string; title?: Labeled } | null;
}

export interface BambooHRAdapter extends ConnectorAdapter {
  listJobs(
    credential: string,
    args?: { limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listApplications(
    credential: string,
    args?: { jobId?: string; searchString?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function parseCredential(
  credential: string,
): { companyDomain: string; apiKey: string } | null {
  const i = credential.indexOf(":");
  if (i <= 0 || i === credential.length - 1) return null;
  const companyDomain = credential.slice(0, i).trim();
  const apiKey = credential.slice(i + 1).trim();
  if (!companyDomain || !apiKey || !/^[a-z0-9-]+$/i.test(companyDomain))
    return null;
  return { companyDomain, apiKey };
}

async function get<T>(
  credential: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const parsed = parseCredential(credential);
  if (!parsed)
    throw new Error(`BambooHR credential is malformed. ${CREDENTIAL_HINT}`);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(
    `${GATEWAY}/${parsed.companyDomain}/v1${path}${qs ? `?${qs}` : ""}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${parsed.apiKey}:x`).toString(
          "base64",
        )}`,
        Accept: "application/json",
      },
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { error?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      res.statusText;
    throw new Error(`BambooHR error (${res.status}): ${detail}`);
  }
  return json as T;
}

function label(v: Labeled): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v.label ?? "";
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const bamboohrAdapter: BambooHRAdapter = {
  provider: "bamboohr",
  authType: "apikey",

  async validateApiKey(credential) {
    if (!parseCredential(credential)) {
      return { ok: false, message: CREDENTIAL_HINT };
    }
    try {
      await get<unknown>(credential, "/applicant_tracking/jobs");
      const companyDomain = parseCredential(credential)?.companyDomain;
      return { ok: true, accountLabel: `BambooHR (${companyDomain})` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listJobs(credential, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const jobs = await get<BambooHRJob[]>(
      credential,
      "/applicant_tracking/jobs",
    );
    const lines = [
      "| Job | Status | Department | Location | Job ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    let count = 0;
    for (const j of jobs ?? []) {
      if (count >= limit) {
        truncated = true;
        break;
      }
      lines.push(
        `| ${cell(label(j.title))} | ${cell(label(j.status))} | ${cell(
          label(j.department),
        )} | ${cell(label(j.location))} | ${j.id ?? ""} |`,
      );
      count++;
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: count ? lines.join("\n") : "_No jobs._",
      count,
      truncated,
    };
  },

  async listApplications(credential, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      applications?: BambooHRApplication[];
      paginationComplete?: boolean;
    }>(credential, "/applicant_tracking/applications", {
      jobId: args?.jobId,
      searchString: args?.searchString,
    });
    const applications = json.applications ?? [];
    const lines = [
      "| Name | Email | Phone | Status | Applied | Job | Application ID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    let count = 0;
    for (const a of applications) {
      if (count >= limit) {
        truncated = true;
        break;
      }
      const name = [a.applicant?.firstName, a.applicant?.lastName]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(a.applicant?.email)} | ${cell(
          a.applicant?.phoneNumber,
        )} | ${cell(label(a.status))} | ${cell(a.appliedDate)} | ${cell(
          label(a.job?.title),
        )} | ${a.id ?? ""} |`,
      );
      count++;
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: count ? lines.join("\n") : "_No applications._",
      count,
      truncated: truncated || json.paginationComplete === false,
    };
  },
};
