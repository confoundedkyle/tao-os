import "server-only";
import type { ConnectorAdapter } from "./types";

// Instantly.ai (cold-email outreach). Auth is an API v2 key (Instantly:
// Settings → Integrations → API keys; needs campaigns:read + leads:create or
// broader scopes) sent as a Bearer header. Lists use cursor paging: pass
// starting_after, read next_starting_after from the { items } envelope.
// Listing leads is a POST by API design (complex filters). Campaign and lead
// statuses arrive as numeric codes — known ones are mapped, unknown ones
// surface raw. Adding a lead is an outward-facing write: in an active
// campaign Instantly queues real outreach emails to that person, so the tool
// layer must make that explicit, and skip_if_in_workspace defaults to true so
// already-contacted emails are never re-enrolled.
const API = "https://api.instantly.ai/api/v2";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100; // Instantly page max
const CHAR_CAP = 12_000;

const CAMPAIGN_STATUS: Record<number, string> = {
  0: "draft",
  1: "active",
  2: "paused",
  3: "completed",
  4: "running subsequences",
  [-99]: "account suspended",
  [-1]: "accounts unhealthy",
  [-2]: "bounce protect",
};

export interface InstantlyCampaign {
  id?: string;
  name?: string | null;
  status?: number | null;
}

export interface InstantlyLead {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  campaign?: string | null;
  status?: number | string | null;
  email_reply_count?: number | null;
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
    args?: { search?: string; startingAfter?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listLeads(
    apiKey: string,
    args?: {
      campaignId?: string;
      search?: string;
      startingAfter?: string;
      limit?: number;
    },
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

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { message?: string } | null)?.message ??
    (json as { error?: string } | null)?.error ??
    res.statusText;
  throw new Error(`Instantly error (${res.status}): ${detail}`);
}

async function request<T>(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  let url = `${API}${path}`;
  const init: RequestInit = { method, headers: headers(apiKey) };
  if (method === "GET" && payload) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(payload))
      if (v !== undefined && v !== "") sp.set(k, String(v));
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  } else if (payload) {
    init.headers = { ...headers(apiKey), "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(res, json);
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function campaignStatus(status?: number | null): string {
  if (status == null) return "";
  return CAMPAIGN_STATUS[status] ?? String(status);
}

export const instantlyAdapter: InstantlyAdapter = {
  provider: "instantly",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await request<unknown>(apiKey, "GET", "/campaigns", { limit: 1 });
      // The workspace name makes a friendlier label; never fail over it.
      let label = "Instantly";
      try {
        const ws = await request<{ name?: string }>(
          apiKey,
          "GET",
          "/workspaces/current",
        );
        if (ws.name) label = `Instantly (${ws.name})`;
      } catch {
        // keep generic label
      }
      return { ok: true, accountLabel: label };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCampaigns(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await request<{
      items?: InstantlyCampaign[];
      next_starting_after?: string | null;
    }>(apiKey, "GET", "/campaigns", {
      limit,
      search: args?.search,
      starting_after: args?.startingAfter,
    });
    const campaigns = json.items ?? [];
    const lines = [
      "| Campaign | Status | Campaign ID |",
      "| --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of campaigns) {
      lines.push(
        `| ${cell(c.name)} | ${cell(campaignStatus(c.status))} | ${cell(c.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const more = !!json.next_starting_after;
    return {
      text: campaigns.length
        ? `${lines.join("\n")}${more ? `\n\n_More available — pass startingAfter: ${json.next_starting_after}_` : ""}`
        : "_No campaigns._",
      count: campaigns.length,
      truncated: truncated || more,
    };
  },

  async listLeads(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    // POST by API design: the leads list takes a filter body, not a query string.
    const json = await request<{
      items?: InstantlyLead[];
      next_starting_after?: string | null;
    }>(apiKey, "POST", "/leads/list", {
      limit,
      campaign: args?.campaignId || undefined,
      search: args?.search || undefined,
      starting_after: args?.startingAfter || undefined,
    });
    const leads = json.items ?? [];
    const lines = [
      "| Name | Email | Company | Status | Replies | Lead ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const l of leads) {
      const name = [l.first_name, l.last_name].filter(Boolean).join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(l.email)} | ${cell(l.company_name)} | ${cell(
          l.status,
        )} | ${l.email_reply_count ?? ""} | ${cell(l.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const more = !!json.next_starting_after;
    return {
      text: leads.length
        ? `${lines.join("\n")}${more ? `\n\n_More available — pass startingAfter: ${json.next_starting_after}_` : ""}`
        : "_No leads._",
      count: leads.length,
      truncated: truncated || more,
    };
  },

  async campaignAnalytics(apiKey, args) {
    const stats = await request<InstantlyAnalytics[]>(
      apiKey,
      "GET",
      "/campaigns/analytics",
      {
        id: args?.campaignId,
        start_date: args?.startDate,
        end_date: args?.endDate,
      },
    );
    const list = Array.isArray(stats) ? stats : [];
    if (list.length === 0) return { text: "_No analytics._", count: 0 };
    const lines = [
      "| Campaign | Status | Leads | Contacted | Sent | Opens | Replies | Bounced | Unsubs | Opportunities |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const s of list) {
      lines.push(
        `| ${cell(s.campaign_name)} | ${cell(campaignStatus(s.campaign_status))} | ${
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

    const lead = await request<{ id?: string; status?: string }>(
      apiKey,
      "POST",
      "/leads",
      body,
    );
    return {
      text: `Added ${args.email} to campaign ${args.campaignId}${
        lead?.status ? ` (lead status: ${lead.status})` : ""
      }.`,
      added: true,
    };
  },
};
