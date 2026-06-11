import "server-only";
import type { ConnectorAdapter } from "./types";

// ContactOut. Auth is an API key sent in the `token` header (alongside
// `authorization: basic`, per the API docs). Specialty is contact data behind
// LinkedIn profiles: search the profile database (People Search — free unless
// reveal_info is set), get a profile's emails/phones (LinkedIn Enrich), find a
// person without their LinkedIn URL (People Enrich), and verify deliverability
// (Email Verify). Enrichment and reveal_info consume paid credits per person.
const API = "https://api.contactout.com";

const DEFAULT_LIMIT = 10;
const HARD_LIMIT = 25; // ContactOut search pages hold up to 25 profiles
const CHAR_CAP = 12_000;

export interface ContactOutAdapter extends ConnectorAdapter {
  linkedinEnrich(
    apiKey: string,
    args: { profileUrl: string; profileOnly?: boolean },
  ): Promise<{ text: string; found: boolean }>;
  personEnrich(
    apiKey: string,
    args: {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      companies?: string[];
      companyDomain?: string;
      jobTitle?: string;
      location?: string;
      linkedinUrl?: string;
      email?: string;
      include?: ("work_email" | "personal_email" | "phone")[];
    },
  ): Promise<{ text: string; found: boolean }>;
  emailVerify(apiKey: string, email: string): Promise<{ text: string }>;
  peopleSearch(
    apiKey: string,
    args: {
      name?: string;
      jobTitles?: string[];
      companies?: string[];
      locations?: string[];
      seniorities?: string[];
      skills?: string[];
      page?: number;
      revealInfo?: boolean;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  return { token: apiKey, authorization: "basic", Accept: "application/json" };
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { message?: string } | null)?.message ??
    (json as { error?: string } | null)?.error ??
    res.statusText;
  throw new Error(`ContactOut error (${res.status}): ${detail}`);
}

async function get<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") sp.set(k, v);
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: headers(apiKey),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(res, json);
  return json as T;
}

async function post<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(res, json);
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

interface ContactOutProfile {
  url?: string | null;
  full_name?: string | null;
  title?: string | null; // search results
  headline?: string | null; // enrich results
  location?: string | null;
  company?: { name?: string | null } | string | null;
  // Enrich responses put contact arrays at the top level of the profile…
  email?: string[] | null;
  work_email?: string[] | null;
  personal_email?: string[] | null;
  phone?: string[] | null;
  // …search responses nest them per profile under contact_info.
  contact_info?: {
    emails?: string[] | null;
    work_emails?: string[] | null;
    personal_emails?: string[] | null;
    phones?: string[] | null;
  } | null;
}

function companyName(p: ContactOutProfile): string {
  if (!p.company) return "";
  return typeof p.company === "string" ? p.company : p.company.name ?? "";
}

function contactsOf(p: ContactOutProfile): {
  work: string[];
  personal: string[];
  other: string[];
  phones: string[];
  any: boolean;
} {
  const c = p.contact_info;
  const work = p.work_email ?? c?.work_emails ?? [];
  const personal = p.personal_email ?? c?.personal_emails ?? [];
  const all = p.email ?? c?.emails ?? [];
  const other = all.filter((e) => !work.includes(e) && !personal.includes(e));
  const phones = p.phone ?? c?.phones ?? [];
  return {
    work,
    personal,
    other,
    phones,
    any: work.length + personal.length + other.length + phones.length > 0,
  };
}

function renderProfile(p: ContactOutProfile, fallbackUrl?: string): string {
  const header = [
    `**${p.full_name ?? "Unknown"}**`,
    p.headline ?? p.title ? `— ${p.headline ?? p.title}` : "",
    companyName(p) ? `at ${companyName(p)}` : "",
    p.location ? `· ${p.location}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const c = contactsOf(p);
  const url = p.url ?? fallbackUrl;
  const detail = [
    c.work.length ? `Work emails: ${c.work.join(", ")}` : null,
    c.personal.length ? `Personal emails: ${c.personal.join(", ")}` : null,
    c.other.length ? `Other emails: ${c.other.join(", ")}` : null,
    c.phones.length ? `Phones: ${c.phones.join(", ")}` : null,
    url ? `LinkedIn: ${url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  if (!c.any) {
    return `${header}\n${detail ? `${detail}\n` : ""}_No contact details returned._`;
  }
  return `${header}\n${detail}`;
}

function renderSearch(entries: [string, ContactOutProfile][]): {
  text: string;
  truncated: boolean;
} {
  if (entries.length === 0)
    return { text: "_No profiles found._", truncated: false };
  const lines = [
    "| Name | Title | Company | Location | LinkedIn | Contacts |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  let truncated = false;
  for (const [url, p] of entries) {
    const c = contactsOf(p);
    const contacts = [
      c.work.length ? `work: ${c.work.join("; ")}` : null,
      c.personal.length ? `personal: ${c.personal.join("; ")}` : null,
      c.other.length ? `email: ${c.other.join("; ")}` : null,
      c.phones.length ? `phone: ${c.phones.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      `| ${cell(p.full_name)} | ${cell(p.title ?? p.headline)} | ${cell(
        companyName(p),
      )} | ${cell(p.location)} | ${cell(p.url ?? url)} | ${cell(contacts)} |`,
    );
    if (lines.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: lines.join("\n"), truncated };
}

export const contactoutAdapter: ContactOutAdapter = {
  provider: "contactout",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Usage stats are free to read — period defaults to the current month.
      await get<{ status_code?: number }>(apiKey, "/v1/stats", {});
      return { ok: true, accountLabel: "ContactOut account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async linkedinEnrich(apiKey, args) {
    if (!args.profileUrl) {
      return { text: "Provide a LinkedIn profile URL.", found: false };
    }
    const json = await get<{ profile?: ContactOutProfile | null }>(
      apiKey,
      "/v1/linkedin/enrich",
      {
        profile: args.profileUrl,
        profile_only: args.profileOnly ? "true" : undefined,
      },
    );
    const p = json.profile;
    if (!p) return { text: "No profile found for that URL.", found: false };
    return {
      text: renderProfile(p, args.profileUrl),
      found: args.profileOnly ? true : contactsOf(p).any,
    };
  },

  async personEnrich(apiKey, args) {
    const hasName =
      args.fullName || (args.firstName && args.lastName);
    if (!hasName && !args.linkedinUrl && !args.email) {
      return {
        text: "Provide the person's name (fullName, or firstName + lastName), or a LinkedIn URL or known email.",
        found: false,
      };
    }
    const hasAnchor =
      args.companies?.length ||
      args.companyDomain ||
      args.jobTitle ||
      args.location ||
      args.linkedinUrl ||
      args.email;
    if (!hasAnchor) {
      return {
        text: "Provide at least one anchor besides the name: companies, companyDomain, jobTitle, location, linkedinUrl, or email.",
        found: false,
      };
    }
    const body: Record<string, unknown> = {
      include: args.include ?? ["work_email", "personal_email", "phone"],
    };
    if (args.fullName) body.full_name = args.fullName;
    if (args.firstName) body.first_name = args.firstName;
    if (args.lastName) body.last_name = args.lastName;
    if (args.companies?.length) body.company = args.companies;
    if (args.companyDomain) body.company_domain = args.companyDomain;
    if (args.jobTitle) body.job_title = args.jobTitle;
    if (args.location) body.location = args.location;
    if (args.linkedinUrl) body.linkedin_url = args.linkedinUrl;
    if (args.email) body.email = args.email;

    const json = await post<{ profile?: ContactOutProfile | null }>(
      apiKey,
      "/v1/people/enrich",
      body,
    );
    const p = json.profile;
    if (!p) return { text: "No match found for that person.", found: false };
    return { text: renderProfile(p), found: contactsOf(p).any };
  },

  async emailVerify(apiKey, email) {
    const json = await get<{ data?: { status?: string } }>(
      apiKey,
      "/v1/email/verify",
      { email },
    );
    return { text: `${email}: ${json.data?.status ?? "unknown"}` };
  },

  async peopleSearch(apiKey, args) {
    if (
      !args.name &&
      !args.jobTitles?.length &&
      !args.companies?.length &&
      !args.locations?.length &&
      !args.seniorities?.length &&
      !args.skills?.length
    ) {
      return {
        text: "Provide at least one search filter: name, jobTitles, companies, locations, seniorities, or skills.",
        count: 0,
        truncated: false,
      };
    }
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const body: Record<string, unknown> = {
      page: args.page ?? 1,
      reveal_info: args.revealInfo ?? false,
    };
    if (args.name) body.name = args.name;
    if (args.jobTitles?.length) body.job_title = args.jobTitles;
    if (args.companies?.length) body.company = args.companies;
    if (args.locations?.length) body.location = args.locations;
    if (args.seniorities?.length) body.seniority = args.seniorities;
    if (args.skills?.length) body.skills = args.skills;

    const json = await post<{
      metadata?: { page?: number; total_results?: number };
      profiles?: Record<string, ContactOutProfile>;
    }>(apiKey, "/v1/people/search", body);
    const entries = Object.entries(json.profiles ?? {}).slice(0, limit);
    const total = json.metadata?.total_results ?? entries.length;
    const rendered = renderSearch(entries);
    const page = json.metadata?.page ?? args.page ?? 1;
    return {
      text: entries.length
        ? `${rendered.text}\n\n_Page ${page} — ${total} total matches._`
        : rendered.text,
      count: entries.length,
      truncated: rendered.truncated || total > entries.length,
    };
  },
};
