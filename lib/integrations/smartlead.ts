import "server-only";
import type { ConnectorAdapter } from "./types";

// Smartlead (cold-email outreach at scale). Auth is an API key (Smartlead:
// Settings → API) passed as an api_key query parameter — that is the only
// auth mode the API offers. Reads are campaigns (direct array, status
// DRAFTED/ACTIVE/PAUSED/STOPPED/ARCHIVED), per-campaign leads (offset/limit
// paging, max 100), and aggregate campaign analytics. The leads envelope has
// varied across API revisions (lead fields inline vs nested under `lead`),
// so both shapes are read. Read-only by design: Smartlead's add-leads
// endpoint is bulk (up to 400 per call), which is too blunt an outreach
// write to hand to an agent.
const API = "https://server.smartlead.ai/api/v1";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100; // Smartlead page max
const CHAR_CAP = 12_000;

export interface SmartleadCampaign {
  id?: number;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface SmartleadLeadFields {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

export interface SmartleadLeadItem extends SmartleadLeadFields {
  lead?: SmartleadLeadFields | null;
  status?: string | null;
  open_count?: number | null;
  reply_count?: number | null;
}

export interface SmartleadAdapter extends ConnectorAdapter {
  listCampaigns(
    apiKey: string,
    args?: { limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listLeads(
    apiKey: string,
    args: { campaignId: string; offset?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  campaignAnalytics(
    apiKey: string,
    args: { campaignId: string },
  ): Promise<{ text: string }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const sp = new URLSearchParams({ api_key: apiKey });
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const res = await fetch(`${API}${path}?${sp.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Smartlead error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const ANALYTICS_FIELDS = [
  "sent_count",
  "open_count",
  "unique_open_count",
  "click_count",
  "reply_count",
  "positive_reply_count",
  "bounce_count",
  "unsubscribed_count",
  "total_count",
] as const;

export const smartleadAdapter: SmartleadAdapter = {
  provider: "smartlead",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/campaigns/");
      return { ok: true, accountLabel: "Smartlead" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCampaigns(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const campaigns = await get<SmartleadCampaign[]>(apiKey, "/campaigns/");
    const lines = [
      "| Campaign | Status | Created | Campaign ID |",
      "| --- | --- | --- | --- |",
    ];
    let truncated = false;
    let count = 0;
    for (const c of campaigns ?? []) {
      if (count >= limit) {
        truncated = true;
        break;
      }
      lines.push(
        `| ${cell(c.name)} | ${cell(c.status)} | ${cell(
          c.created_at?.slice(0, 10),
        )} | ${c.id ?? ""} |`,
      );
      count++;
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: count ? lines.join("\n") : "_No campaigns._",
      count,
      truncated,
    };
  },

  async listLeads(apiKey, args) {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<
      | { total_leads?: number; data?: SmartleadLeadItem[] }
      | SmartleadLeadItem[]
    >(apiKey, `/campaigns/${encodeURIComponent(args.campaignId)}/leads`, {
      offset: args.offset ?? 0,
      limit,
    });
    const items = Array.isArray(json) ? json : (json.data ?? []);
    const total = Array.isArray(json)
      ? items.length
      : (json.total_leads ?? items.length);
    const lines = [
      "| Name | Email | Company | Status | Opens | Replies |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const item of items) {
      const lead = item.lead ?? item;
      const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(lead.email)} | ${cell(
          lead.company_name,
        )} | ${cell(item.status)} | ${item.open_count ?? ""} | ${
          item.reply_count ?? ""
        } |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: items.length
        ? `${lines.join("\n")}\n\n_${total} total leads — page with offset._`
        : "_No leads._",
      count: items.length,
      truncated: truncated || total > (args.offset ?? 0) + items.length,
    };
  },

  async campaignAnalytics(apiKey, args) {
    const json = await get<Record<string, unknown>>(
      apiKey,
      `/campaigns/${encodeURIComponent(args.campaignId)}/analytics`,
    );
    const lines: string[] = [];
    for (const field of ANALYTICS_FIELDS) {
      const value = json[field];
      if (value !== undefined && value !== null) {
        lines.push(`- ${field.replace(/_/g, " ")}: ${value}`);
      }
    }
    if (!lines.length) {
      const s = JSON.stringify(json, null, 1) ?? "";
      return {
        text: s.length > CHAR_CAP ? `${s.slice(0, CHAR_CAP)}\n…(truncated)` : s,
      };
    }
    return { text: lines.join("\n") };
  },
};
