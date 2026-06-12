import "server-only";
import type { ConnectorAdapter } from "./types";

// Woodpecker (cold-email outreach, popular with EU agencies). Auth is an API
// key (Woodpecker: Add-ons → API & Integrations → API keys) sent as an
// x-api-key header. Reads are campaigns (GET /v1/campaign_list, bare array,
// status RUNNING/DRAFT/EDITED/PAUSED/STOPPED/COMPLETED), prospects
// (GET /v1/prospects, page/per_page paging, filterable by status and
// per-campaign interest level), and per-campaign statistics (a v2 endpoint
// whose schema isn't published, so the stats op renders whatever numeric
// fields come back). The prospects `search` parameter takes comma-separated
// field=value pairs (email=…, company=…) combined with AND.
const API = "https://api.woodpecker.co/rest";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 200;
const CHAR_CAP = 12_000;

export interface WoodpeckerCampaign {
  id?: number;
  name?: string | null;
  status?: string | null;
  created?: string | null;
  per_day?: number | null;
  folder_name?: string | null;
}

export interface WoodpeckerProspect {
  id?: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  status?: string | null;
  last_contacted?: string | null;
  last_replied?: string | null;
}

export interface WoodpeckerAdapter extends ConnectorAdapter {
  listCampaigns(
    apiKey: string,
    args?: { status?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listProspects(
    apiKey: string,
    args?: {
      email?: string;
      company?: string;
      status?: string;
      campaignId?: number;
      interested?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  campaignStats(
    apiKey: string,
    args: { campaignId: number },
  ): Promise<{ text: string }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Woodpecker error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const woodpeckerAdapter: WoodpeckerAdapter = {
  provider: "woodpecker",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/v1/campaign_list");
      return { ok: true, accountLabel: "Woodpecker" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCampaigns(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const campaigns = await get<WoodpeckerCampaign[]>(
      apiKey,
      "/v1/campaign_list",
      { status: args?.status },
    );
    const lines = [
      "| Campaign | Status | Created | Folder | Daily limit | Campaign ID |",
      "| --- | --- | --- | --- | --- | --- |",
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
          c.created?.slice(0, 10),
        )} | ${cell(c.folder_name)} | ${c.per_day ?? ""} | ${c.id ?? ""} |`,
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

  async listProspects(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const search = [
      args?.email ? `email=${args.email}` : "",
      args?.company ? `company=${args.company}` : "",
    ]
      .filter(Boolean)
      .join(",");
    const prospects = await get<WoodpeckerProspect[]>(apiKey, "/v1/prospects", {
      search: search || undefined,
      status: args?.status,
      campaigns_id: args?.campaignId,
      interested: args?.interested,
      page: args?.page ?? 1,
      per_page: limit,
    });
    const items = prospects ?? [];
    const lines = [
      "| Name | Email | Company | Title | Status | Last contacted | Last replied |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of items) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      lines.push(
        `| ${cell(name)} | ${cell(p.email)} | ${cell(p.company)} | ${cell(
          p.title,
        )} | ${cell(p.status)} | ${cell(
          p.last_contacted?.slice(0, 10),
        )} | ${cell(p.last_replied?.slice(0, 10))} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: items.length
        ? `${lines.join("\n")}\n\n_Page ${args?.page ?? 1} — a full page means more may follow._`
        : "_No prospects found._",
      count: items.length,
      truncated: truncated || items.length >= limit,
    };
  },

  async campaignStats(apiKey, args) {
    const json = await get<Record<string, unknown>>(
      apiKey,
      `/v2/campaigns/${encodeURIComponent(String(args.campaignId))}/statistics`,
    );
    // Schema isn't published — render every scalar field, one level deep.
    const lines: string[] = [];
    const walk = (obj: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "object" && !Array.isArray(v) && !prefix) {
          walk(v as Record<string, unknown>, `${k} `);
        } else if (typeof v === "number" || typeof v === "string") {
          lines.push(`- ${prefix}${k.replace(/_/g, " ")}: ${v}`);
        }
      }
    };
    walk(json ?? {}, "");
    if (!lines.length) return { text: "_No statistics available._" };
    const text = lines.join("\n");
    return {
      text: text.length > CHAR_CAP ? `${text.slice(0, CHAR_CAP)}\n…(truncated)` : text,
    };
  },
};
