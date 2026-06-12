import "server-only";
import type { ConnectorAdapter } from "./types";

// Instantly.ai (cold-email outreach). Auth is an API v2 key (Instantly:
// Settings → Integrations → API keys; needs campaigns:read + leads:create or
// broader scopes) sent as a Bearer header. Campaign status is a numeric enum
// rendered to names. Adding a lead is an outward-facing write — an Active
// campaign starts emailing the person — so the tool layer warns, and
// skip_if_in_workspace defaults to true so already-contacted emails are never
// re-enrolled. Lists paginate with limit/starting_after (one page per call).
const API = "https://api.instantly.ai/api/v2";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

const STATUS_NAMES: Record<number, string> = {
  0: "Draft",
  1: "Active",
  2: "Paused",
  3: "Completed",
  4: "Running Subsequences",
  [-1]: "Accounts Unhealthy",
  [-2]: "Bounce Protect",
  [-99]: "Account Suspended",
};

export interface InstantlyCampaign {
  id?: string;
  name?: string | null;
  status?: number | null;
}

export interface InstantlyAnalytics {
  campaign_id?: string;
  campaign_name?: string | null;
  campaign_status?: number | null;
  leads_count?: number | null;
  contacted_count?: number | null;
  emails_sent_count?: number | null;
  open_count_unique?: number | null;
  reply_count_unique?: number | null;
  bounced_count?: number | null;
  unsubscribed_count?: number | null;
  completed_count?: number | null;
  total_opportunities?: number | null;
}

export interface InstantlyAdapter extends ConnectorAdapter {
  listCampaigns(
    apiKey: string,
    args?: { search?: string; status?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  campaignAnalytics(
    apiKey: string,
    args?: { campaignId?: string; startDate?: string; endDate?: string },
  ): Promise<{ text: string; count: number }>;
  addLead(
    apiKey: string,
    args: {
      campaignId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      jobTitle?: string;
      personalization?: string;
      skipIfInWorkspace?: boolean;
    },
  ): Promise<{ text: string; added: boolean }>;
}

async function call<T>(
  apiKey: string,
  path: string,
  opts?: {
    method?: string;
    params?: Record<string, string | number | undefined>;
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
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`Instantly error (${res.status}): ${detail}`);
  }
  return json as T;
}

function statusName(status: number | null | undefined): string {
  if (status == null) return "";
  return STATUS_NAMES[status] ?? String(status);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const instantlyAdapter: InstantlyAdapter = {
  provider: "instantly",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await call<unknown>(apiKey, "/campaigns", { params: { limit: 1 } });
      return { ok: true, accountLabel: "Instantly workspace" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCampaigns(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await call<{
      items?: InstantlyCampaign[];
      next_starting_after?: string;
    }>(apiKey, "/campaigns", {
      params: { limit, search: args?.search, status: args?.status },
    });
    const campaigns = json.items ?? [];
    const lines = [
      "| Campaign | Status | Campaign ID |",
      "| --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of campaigns) {
      lines.push(
        `| ${cell(c.name)} | ${cell(statusName(c.status))} | ${cell(c.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: campaigns.length ? lines.join("\n") : "_No campaigns._",
      count: campaigns.length,
      truncated: truncated || !!json.next_starting_after,
    };
  },

  async campaignAnalytics(apiKey, args) {
    const stats = await call<InstantlyAnalytics[]>(apiKey, "/campaigns/analytics", {
      params: {
        id: args?.campaignId,
        start_date: args?.startDate,
        end_date: args?.endDate,
      },
    });
    const list = Array.isArray(stats) ? stats : [];
    if (list.length === 0) return { text: "_No analytics._", count: 0 };
    const lines = [
      "| Campaign | Status | Leads | Contacted | Sent | Opens | Replies | Bounced | Unsubs | Opportunities |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const s of list) {
      lines.push(
        `| ${cell(s.campaign_name)} | ${cell(statusName(s.campaign_status))} | ${
          s.leads_count ?? ""
        } | ${s.contacted_count ?? ""} | ${s.emails_sent_count ?? ""} | ${
          s.open_count_unique ?? ""
        } | ${s.reply_count_unique ?? ""} | ${s.bounced_count ?? ""} | ${
          s.unsubscribed_count ?? ""
        } | ${s.total_opportunities ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) break;
    }
    return { text: lines.join("\n"), count: list.length };
  },

  async addLead(apiKey, args) {
    if (!args.campaignId || !args.email) {
      return {
        text: "Provide a campaignId (from instantly_list_campaigns) and the lead's email.",
        added: false,
      };
    }
    const body: Record<string, unknown> = {
      campaign: args.campaignId,
      email: args.email,
      skip_if_in_workspace: args.skipIfInWorkspace ?? true,
      skip_if_in_campaign: true,
    };
    if (args.firstName) body.first_name = args.firstName;
    if (args.lastName) body.last_name = args.lastName;
    if (args.companyName) body.company_name = args.companyName;
    if (args.jobTitle) body.job_title = args.jobTitle;
    if (args.personalization) body.personalization = args.personalization;

    const lead = await call<{ id?: string; status?: string }>(
      apiKey,
      "/leads",
      { method: "POST", body },
    );
    return {
      text: `Added ${args.email} to campaign ${args.campaignId}${
        lead?.status ? ` (lead status: ${lead.status})` : ""
      }.`,
      added: true,
    };
  },
};
