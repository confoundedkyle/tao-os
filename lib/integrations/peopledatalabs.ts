import "server-only";
import type { ConnectorAdapter } from "./types";

// People Data Labs. Auth is an API key (PDL dashboard → API Keys) sent as an
// X-Api-Key header. Two reads: Person Enrichment (GET /v5/person/enrich —
// resolve one person from email / LinkedIn URL / name + company anchor;
// charges a credit only on match, 404 means no match) and Person Search
// (POST /v5/person/search with SQL of the form SELECT * FROM person WHERE … —
// EVERY returned record costs a credit, so size stays small). Likelihood is
// PDL's 0–10 match confidence.
const API = "https://api.peopledatalabs.com/v5";

const DEFAULT_SEARCH_SIZE = 5;
const HARD_SEARCH_SIZE = 25; // every record returned is billed — keep pages small
const CHAR_CAP = 12_000;

export interface PdlPerson {
  full_name?: string | null;
  job_title?: string | null;
  job_company_name?: string | null;
  location_name?: string | null;
  work_email?: string | null;
  personal_emails?: string[] | null;
  mobile_phone?: string | null;
  phone_numbers?: string[] | null;
  linkedin_url?: string | null;
}

export interface PeopleDataLabsAdapter extends ConnectorAdapter {
  enrichPerson(
    apiKey: string,
    args: {
      email?: string;
      profile?: string;
      name?: string;
      company?: string;
      location?: string;
      minLikelihood?: number;
    },
  ): Promise<{ text: string; found: boolean }>;
  searchPeople(
    apiKey: string,
    args: { sql: string; size?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { error?: { message?: string } } | null)?.error?.message ??
    (json as { message?: string } | null)?.message ??
    res.statusText;
  throw new Error(`People Data Labs error (${res.status}): ${detail}`);
}

function headers(apiKey: string): Record<string, string> {
  return { "X-Api-Key": apiKey, Accept: "application/json" };
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderPerson(p: PdlPerson, likelihood?: number): string {
  const header = [
    `**${p.full_name ?? "Unknown"}**`,
    p.job_title ? `— ${p.job_title}` : "",
    p.job_company_name ? `at ${p.job_company_name}` : "",
    p.location_name ? `· ${p.location_name}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const phones = [p.mobile_phone, ...(p.phone_numbers ?? [])].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );
  const detail = [
    p.work_email ? `Work email: ${p.work_email}` : null,
    p.personal_emails?.length
      ? `Personal emails: ${p.personal_emails.join(", ")}`
      : null,
    phones.length ? `Phones: ${phones.join(", ")}` : null,
    p.linkedin_url ? `LinkedIn: ${p.linkedin_url}` : null,
    likelihood !== undefined ? `Match likelihood: ${likelihood}/10` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${header}\n${detail || "_No contact details returned._"}`;
}

export const peopledatalabsAdapter: PeopleDataLabsAdapter = {
  provider: "peopledatalabs",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // A parameterless enrich is free: 400 (missing params) proves the key is
      // accepted, 401/403 means it isn't. Never charges a credit.
      const res = await fetch(`${API}/person/enrich`, {
        headers: headers(apiKey),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "People Data Labs rejected this API key." };
      }
      return { ok: true, accountLabel: "People Data Labs" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async enrichPerson(apiKey, args) {
    const hasAnchor =
      args.email || args.profile || (args.name && (args.company || args.location));
    if (!hasAnchor) {
      return {
        text: "Provide an email, a LinkedIn profile URL, or a name plus a company or location anchor.",
        found: false,
      };
    }
    const sp = new URLSearchParams();
    if (args.email) sp.set("email", args.email);
    if (args.profile) sp.set("profile", args.profile);
    if (args.name) sp.set("name", args.name);
    if (args.company) sp.set("company", args.company);
    if (args.location) sp.set("location", args.location);
    if (args.minLikelihood !== undefined)
      sp.set("min_likelihood", String(args.minLikelihood));
    const res = await fetch(`${API}/person/enrich?${sp.toString()}`, {
      headers: headers(apiKey),
    });
    const json = (await res.json().catch(() => null)) as {
      likelihood?: number;
      data?: PdlPerson | null;
    } | null;
    if (res.status === 404) {
      return { text: "No match found for that person.", found: false };
    }
    if (!res.ok) fail(res, json);
    if (!json?.data) {
      return { text: "No match found for that person.", found: false };
    }
    return { text: renderPerson(json.data, json.likelihood), found: true };
  },

  async searchPeople(apiKey, args) {
    if (!args.sql?.trim()) {
      return {
        text: 'Provide a SQL query of the form: SELECT * FROM person WHERE job_title = \'recruiter\' AND location_country = \'germany\'.',
        count: 0,
        truncated: false,
      };
    }
    const size = Math.min(args.size ?? DEFAULT_SEARCH_SIZE, HARD_SEARCH_SIZE);
    const res = await fetch(`${API}/person/search`, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ sql: args.sql, size }),
    });
    const json = (await res.json().catch(() => null)) as {
      total?: number;
      data?: PdlPerson[];
    } | null;
    if (res.status === 404) {
      return { text: "_No profiles found._", count: 0, truncated: false };
    }
    if (!res.ok) fail(res, json);
    const people = json?.data ?? [];
    const lines = [
      "| Name | Title | Company | Location | Work email | LinkedIn |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of people) {
      lines.push(
        `| ${cell(p.full_name)} | ${cell(p.job_title)} | ${cell(
          p.job_company_name,
        )} | ${cell(p.location_name)} | ${cell(p.work_email)} | ${cell(
          p.linkedin_url,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json?.total ?? people.length;
    return {
      text: people.length
        ? `${lines.join("\n")}\n\n_${total} total matches._`
        : "_No profiles found._",
      count: people.length,
      truncated: truncated || total > people.length,
    };
  },
};
