import "server-only";
import type { ConnectorAdapter } from "./types";

// Lever ATS. Auth is an API key (Settings → Integrations and API) sent as
// HTTP Basic with the key as the username and an empty password — same scheme
// as Ashby. Jobs are "postings" and candidates are "opportunities"; lists use
// {data, hasNext, next} envelopes with limit/offset cursors (one page per
// tool call). Opportunities expand=stage so stages render as names, not ids.
const API = "https://api.lever.co/v1";

const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 100;
const CHAR_CAP = 12_000;

interface LeverEnvelope<T> {
  data?: T[];
  hasNext?: boolean;
}

export interface LeverPosting {
  id?: string;
  text?: string | null;
  state?: string | null;
  categories?: {
    team?: string | null;
    location?: string | null;
    commitment?: string | null;
  } | null;
}

export interface LeverOpportunity {
  id?: string;
  name?: string | null;
  headline?: string | null;
  emails?: string[] | null;
  phones?: { value?: string | null }[] | null;
  stage?: { text?: string | null } | string | null;
  tags?: string[] | null;
}

export interface LeverAdapter extends ConnectorAdapter {
  listPostings(
    apiKey: string,
    args?: { state?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listOpportunities(
    apiKey: string,
    args?: { postingId?: string; email?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
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
    headers: { Authorization: authHeader(apiKey), Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Lever error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function stageOf(o: LeverOpportunity): string {
  if (!o.stage) return "";
  return typeof o.stage === "string" ? o.stage : o.stage.text ?? "";
}

export const leverAdapter: LeverAdapter = {
  provider: "lever",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/postings", { limit: 1 });
      return { ok: true, accountLabel: "Lever account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listPostings(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<LeverEnvelope<LeverPosting>>(apiKey, "/postings", {
      state: args?.state,
      limit,
    });
    const postings = json.data ?? [];
    const lines = [
      "| Job | State | Team | Location | Posting ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of postings) {
      lines.push(
        `| ${cell(p.text)} | ${cell(p.state)} | ${cell(
          p.categories?.team,
        )} | ${cell(p.categories?.location)} | ${cell(p.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: postings.length ? lines.join("\n") : "_No postings._",
      count: postings.length,
      truncated: truncated || !!json.hasNext,
    };
  },

  async listOpportunities(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<LeverEnvelope<LeverOpportunity>>(
      apiKey,
      "/opportunities",
      {
        posting_id: args?.postingId,
        email: args?.email,
        expand: "stage",
        limit,
      },
    );
    const opportunities = json.data ?? [];
    const lines = [
      "| Name | Headline | Email | Phone | Stage | Opportunity ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const o of opportunities) {
      lines.push(
        `| ${cell(o.name)} | ${cell(o.headline)} | ${cell(
          o.emails?.[0],
        )} | ${cell(o.phones?.[0]?.value)} | ${cell(stageOf(o))} | ${cell(
          o.id,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: opportunities.length ? lines.join("\n") : "_No candidates._",
      count: opportunities.length,
      truncated: truncated || !!json.hasNext,
    };
  },
};
