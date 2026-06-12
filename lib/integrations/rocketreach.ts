import "server-only";
import type { ConnectorAdapter } from "./types";

// RocketReach. Auth is an API key (RocketReach: Account → API) sent as an
// Api-Key header. Search (POST /person/search) finds profiles by
// name/title/employer/location but returns no contact details and is free;
// Lookup (GET /person/lookup) reveals emails/phones and costs a credit per
// match. Lookups can resolve asynchronously: a "progress"/"searching" status
// means the contact graph is still being crawled — poll /person/checkStatus
// with the profile id (same pattern as Bright Data snapshots).
const API = "https://api.rocketreach.co/api/v2";

const DEFAULT_PAGE_SIZE = 10;
const HARD_PAGE_SIZE = 25;
const CHAR_CAP = 12_000;

export interface RocketReachProfile {
  id?: number;
  name?: string | null;
  current_title?: string | null;
  current_employer?: string | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  linkedin_url?: string | null;
  status?: string | null;
  emails?:
    | { email?: string | null; smtp_valid?: string | null; type?: string | null }[]
    | null;
  phones?: { number?: string | null; type?: string | null }[] | null;
}

export interface RocketReachAdapter extends ConnectorAdapter {
  searchPeople(
    apiKey: string,
    args: {
      name?: string;
      titles?: string[];
      employers?: string[];
      locations?: string[];
      page?: number;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  lookupPerson(
    apiKey: string,
    args: {
      name?: string;
      currentEmployer?: string;
      email?: string;
      linkedinUrl?: string;
      profileId?: number;
    },
  ): Promise<{ text: string; found: boolean; pending: boolean }>;
  checkLookup(
    apiKey: string,
    profileId: number,
  ): Promise<{ text: string; found: boolean; pending: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  return { "Api-Key": apiKey, Accept: "application/json" };
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { detail?: string } | null)?.detail ??
    (json as { message?: string } | null)?.message ??
    res.statusText;
  throw new Error(`RocketReach error (${res.status}): ${detail}`);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function locationOf(p: RocketReachProfile): string {
  return p.location ?? [p.city, p.region].filter(Boolean).join(", ");
}

function isPending(status?: string | null): boolean {
  return status === "searching" || status === "progress" || status === "waiting";
}

function renderProfile(p: RocketReachProfile): { text: string; found: boolean } {
  const header = [
    `**${p.name ?? "Unknown"}**`,
    p.current_title ? `— ${p.current_title}` : "",
    p.current_employer ? `at ${p.current_employer}` : "",
    locationOf(p) ? `· ${locationOf(p)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const emails = (p.emails ?? [])
    .filter((e) => e.email)
    .map(
      (e) =>
        `${e.email}${e.type ? ` (${e.type}${e.smtp_valid ? `, ${e.smtp_valid}` : ""})` : ""}`,
    );
  const phones = (p.phones ?? []).filter((ph) => ph.number).map((ph) => ph.number!);
  const detail = [
    emails.length ? `Emails: ${emails.join(", ")}` : null,
    phones.length ? `Phones: ${phones.join(", ")}` : null,
    p.linkedin_url ? `LinkedIn: ${p.linkedin_url}` : null,
    p.id ? `Profile id: ${p.id}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const found = emails.length + phones.length > 0;
  return {
    text: `${header}\n${detail}${found ? "" : "\n_No contact details returned._"}`,
    found,
  };
}

function renderPendingOrProfile(p: RocketReachProfile): {
  text: string;
  found: boolean;
  pending: boolean;
} {
  if (isPending(p.status)) {
    return {
      text: `Lookup for ${p.name ?? "this person"} is still in progress (profile id ${
        p.id ?? "unknown"
      }). Call rocketreach_check_lookup with that id after working on something else for a moment.`,
      found: false,
      pending: true,
    };
  }
  const rendered = renderProfile(p);
  return { ...rendered, pending: false };
}

export const rocketreachAdapter: RocketReachAdapter = {
  provider: "rocketreach",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const res = await fetch(`${API}/account/`, { headers: headers(apiKey) });
      const json = (await res.json().catch(() => null)) as {
        name?: string;
        email?: string;
      } | null;
      if (!res.ok) fail(res, json);
      const label = json?.name ?? json?.email;
      return {
        ok: true,
        accountLabel: label ? `RocketReach (${label})` : "RocketReach",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchPeople(apiKey, args) {
    const query: Record<string, string[]> = {};
    if (args.name) query.name = [args.name];
    if (args.titles?.length) query.current_title = args.titles;
    if (args.employers?.length) query.current_employer = args.employers;
    if (args.locations?.length) query.location = args.locations;
    if (Object.keys(query).length === 0) {
      return {
        text: "Provide at least one search filter: name, titles, employers, or locations.",
        count: 0,
        truncated: false,
      };
    }
    const pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, HARD_PAGE_SIZE);
    const start = ((args.page ?? 1) - 1) * pageSize + 1;
    const res = await fetch(`${API}/person/search`, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ query, start, page_size: pageSize }),
    });
    const json = (await res.json().catch(() => null)) as {
      profiles?: RocketReachProfile[];
      pagination?: { total?: number };
    } | null;
    if (!res.ok) fail(res, json);
    const profiles = json?.profiles ?? [];
    const lines = [
      "| Name | Title | Company | Location | LinkedIn | Profile ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of profiles) {
      lines.push(
        `| ${cell(p.name)} | ${cell(p.current_title)} | ${cell(
          p.current_employer,
        )} | ${cell(locationOf(p))} | ${cell(p.linkedin_url)} | ${p.id ?? ""} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json?.pagination?.total ?? profiles.length;
    return {
      text: profiles.length
        ? `${lines.join("\n")}\n\n_${total} total matches. Search shows no contact details — use rocketreach_lookup_person (costs a credit) on the people you actually need._`
        : "_No profiles found._",
      count: profiles.length,
      truncated: truncated || total > profiles.length,
    };
  },

  async lookupPerson(apiKey, args) {
    const hasAnchor =
      args.profileId ||
      args.email ||
      args.linkedinUrl ||
      (args.name && args.currentEmployer);
    if (!hasAnchor) {
      return {
        text: "Provide a profileId (from search), an email, a LinkedIn URL, or a name plus currentEmployer.",
        found: false,
        pending: false,
      };
    }
    const sp = new URLSearchParams();
    if (args.profileId) sp.set("id", String(args.profileId));
    if (args.name) sp.set("name", args.name);
    if (args.currentEmployer) sp.set("current_employer", args.currentEmployer);
    if (args.email) sp.set("email", args.email);
    if (args.linkedinUrl) sp.set("linkedin_url", args.linkedinUrl);
    const res = await fetch(`${API}/person/lookup?${sp.toString()}`, {
      headers: headers(apiKey),
    });
    const json = (await res.json().catch(() => null)) as RocketReachProfile | null;
    if (res.status === 404) {
      return { text: "No match found for that person.", found: false, pending: false };
    }
    if (!res.ok) fail(res, json);
    if (!json) {
      return { text: "No match found for that person.", found: false, pending: false };
    }
    return renderPendingOrProfile(json);
  },

  async checkLookup(apiKey, profileId) {
    const res = await fetch(
      `${API}/person/checkStatus?ids=${encodeURIComponent(String(profileId))}`,
      { headers: headers(apiKey) },
    );
    const json = (await res.json().catch(() => null)) as
      | RocketReachProfile[]
      | null;
    if (!res.ok) fail(res, json);
    const p = json?.[0];
    if (!p) {
      return {
        text: `No lookup found for profile id ${profileId}.`,
        found: false,
        pending: false,
      };
    }
    return renderPendingOrProfile(p);
  },
};
