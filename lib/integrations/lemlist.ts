import "server-only";
import type { ConnectorAdapter } from "./types";

// lemlist (cold-outreach sequences). Auth is HTTP Basic with an EMPTY username
// and the API key as the password — the encoded string is ":apiKey", colon
// first (Settings → Integrations → API in lemlist). Reads use the v2 query
// versioning. Adding a lead is an outward-facing write: once a lead lands in a
// RUNNING campaign, lemlist queues real outreach emails to that person — the
// tool layer must make that cost explicit and default deduplicate to true.
const API = "https://api.lemlist.com/api";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100; // lemlist page max
const CHAR_CAP = 12_000;

export interface LemlistCampaign {
  _id: string;
  name?: string | null;
  status?: string | null;
  hasError?: boolean;
  errors?: string[] | null;
}

export interface LemlistActivity {
  type?: string | null;
  createdAt?: string | null;
  leadEmail?: string | null;
  leadFirstName?: string | null;
  leadLastName?: string | null;
  leadCompanyName?: string | null;
  campaignName?: string | null;
  sequenceStep?: number | null;
}

export interface LemlistAdapter extends ConnectorAdapter {
  listCampaigns(
    apiKey: string,
    args?: { status?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listActivities(
    apiKey: string,
    args?: { campaignId?: string; type?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  addLead(
    apiKey: string,
    args: {
      campaignId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      jobTitle?: string;
      linkedinUrl?: string;
      companyDomain?: string;
      icebreaker?: string;
      deduplicate?: boolean;
    },
  ): Promise<{ text: string; added: boolean }>;
}

function authHeader(apiKey: string): string {
  // lemlist wants ":apiKey" — empty username, key as the password.
  return `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`;
}

async function call<T>(
  apiKey: string,
  path: string,
  opts?: {
    method?: string;
    params?: Record<string, string | number | boolean | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(opts?.params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method: opts?.method ?? "GET",
    headers: {
      Authorization: authHeader(apiKey),
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`lemlist error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const lemlistAdapter: LemlistAdapter = {
  provider: "lemlist",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const team = await call<{ name?: string }>(apiKey, "/team");
      return { ok: true, accountLabel: team?.name ?? "lemlist team" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCampaigns(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await call<LemlistCampaign[] | { campaigns?: LemlistCampaign[] }>(
      apiKey,
      "/campaigns",
      { params: { version: "v2", limit, status: args?.status } },
    );
    const campaigns = Array.isArray(json) ? json : json?.campaigns ?? [];
    const lines = [
      "| Campaign | Status | Errors | Campaign ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of campaigns) {
      lines.push(
        `| ${cell(c.name)} | ${cell(c.status)} | ${cell(
          (c.errors ?? []).join("; "),
        )} | ${c._id} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: campaigns.length ? lines.join("\n") : "_No campaigns._",
      count: campaigns.length,
      truncated: truncated || campaigns.length === limit,
    };
  },

  async listActivities(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const activities = await call<LemlistActivity[]>(apiKey, "/activities", {
      params: {
        version: "v2",
        limit,
        campaignId: args?.campaignId,
        type: args?.type,
      },
    });
    const list = Array.isArray(activities) ? activities : [];
    const lines = [
      "| When | Type | Lead | Company | Campaign | Step |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const a of list) {
      const lead =
        [a.leadFirstName, a.leadLastName].filter(Boolean).join(" ") ||
        a.leadEmail ||
        "";
      lines.push(
        `| ${cell(a.createdAt?.slice(0, 16))} | ${cell(a.type)} | ${cell(
          lead,
        )} | ${cell(a.leadCompanyName)} | ${cell(a.campaignName)} | ${
          a.sequenceStep ?? ""
        } |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: list.length ? lines.join("\n") : "_No activities._",
      count: list.length,
      truncated: truncated || list.length === limit,
    };
  },

  async addLead(apiKey, args) {
    if (!args.campaignId || !args.email) {
      return {
        text: "Provide a campaignId (from lemlist_list_campaigns) and the lead's email.",
        added: false,
      };
    }
    const body: Record<string, unknown> = { email: args.email };
    if (args.firstName) body.firstName = args.firstName;
    if (args.lastName) body.lastName = args.lastName;
    if (args.companyName) body.companyName = args.companyName;
    if (args.jobTitle) body.jobTitle = args.jobTitle;
    if (args.linkedinUrl) body.linkedinUrl = args.linkedinUrl;
    if (args.companyDomain) body.companyDomain = args.companyDomain;
    if (args.icebreaker) body.icebreaker = args.icebreaker;

    const lead = await call<{
      _id?: string;
      campaignName?: string;
      isPaused?: boolean;
    }>(apiKey, `/campaigns/${encodeURIComponent(args.campaignId)}/leads/`, {
      method: "POST",
      params: { deduplicate: args.deduplicate ?? true },
      body,
    });
    return {
      text: `Added ${args.email} to campaign ${
        lead?.campaignName ?? args.campaignId
      }${lead?.isPaused ? " (lead paused)" : ""}.`,
      added: true,
    };
  },
};
