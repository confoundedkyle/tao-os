import "server-only";
import type { ConnectorAdapter } from "./types";

// Hunter.io. Auth is an API key passed as the `api_key` query param. Used for
// business development: find people in given roles/functions at a company
// (Domain Search), find a specific person's email (Email Finder), and verify
// deliverability (Email Verifier).
const API = "https://api.hunter.io/v2";

const DEFAULT_LIMIT = 10;
const HARD_LIMIT = 100;

export interface HunterAdapter extends ConnectorAdapter {
  domainSearch(
    apiKey: string,
    args: {
      domain?: string;
      company?: string;
      department?: string;
      seniority?: string;
      type?: "personal" | "generic";
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  emailFinder(
    apiKey: string,
    args: {
      domain?: string;
      company?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<{ text: string; found: boolean }>;
  emailVerifier(
    apiKey: string,
    email: string,
  ): Promise<{ text: string }>;
}

function url(path: string, apiKey: string, params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams({ api_key: apiKey });
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  return `${API}${path}?${sp.toString()}`;
}

async function get<T>(fullUrl: string): Promise<T> {
  const res = await fetch(fullUrl, { headers: { Accept: "application/json" } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      json?.errors?.[0]?.details ?? json?.errors?.[0]?.code ?? res.statusText;
    throw new Error(`Hunter.io error (${res.status}): ${detail}`);
  }
  return json as T;
}

interface HunterEmail {
  value: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  department?: string | null;
  seniority?: string | null;
  confidence?: number | null;
  type?: string | null;
  linkedin?: string | null;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderEmails(emails: HunterEmail[]): string {
  if (emails.length === 0) return "_No contacts found._";
  const lines = [
    "| Name | Position | Department | Seniority | Email | Confidence |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const e of emails) {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
    lines.push(
      `| ${cell(name)} | ${cell(e.position)} | ${cell(e.department)} | ${cell(
        e.seniority,
      )} | ${cell(e.value)} | ${e.confidence ?? ""} |`,
    );
  }
  return lines.join("\n");
}

export const hunterAdapter: HunterAdapter = {
  provider: "hunter",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const json = await get<{ data?: { email?: string; plan_name?: string } }>(
        url("/account", apiKey, {}),
      );
      return { ok: true, accountLabel: json.data?.email ?? "Hunter.io account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async domainSearch(apiKey, args) {
    if (!args.domain && !args.company) {
      return { text: "Provide a domain or company name.", count: 0, truncated: false };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      data?: { emails?: HunterEmail[] };
      meta?: { results?: number };
    }>(
      url("/domain-search", apiKey, {
        domain: args.domain,
        company: args.company,
        department: args.department,
        seniority: args.seniority,
        type: args.type,
        limit,
      }),
    );
    const emails = json.data?.emails ?? [];
    const total = json.meta?.results ?? emails.length;
    return {
      text: renderEmails(emails),
      count: emails.length,
      truncated: total > emails.length,
    };
  },

  async emailFinder(apiKey, args) {
    if (!args.domain && !args.company) {
      return { text: "Provide a domain or company name.", found: false };
    }
    const json = await get<{
      data?: { email?: string | null; score?: number | null; position?: string | null };
    }>(
      url("/email-finder", apiKey, {
        domain: args.domain,
        company: args.company,
        full_name: args.fullName,
        first_name: args.firstName,
        last_name: args.lastName,
      }),
    );
    const email = json.data?.email ?? null;
    if (!email) return { text: "No email found for that person.", found: false };
    return {
      text: `${email} (confidence ${json.data?.score ?? "?"}%${
        json.data?.position ? `, ${json.data.position}` : ""
      })`,
      found: true,
    };
  },

  async emailVerifier(apiKey, email) {
    const json = await get<{
      data?: { status?: string; result?: string; score?: number };
    }>(url("/email-verifier", apiKey, { email }));
    const d = json.data ?? {};
    return {
      text: `${email}: ${d.result ?? d.status ?? "unknown"} (score ${
        d.score ?? "?"
      })`,
    };
  },
};
