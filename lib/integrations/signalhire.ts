import "server-only";
import type { ConnectorAdapter } from "./types";

// SignalHire. Auth is an API key (SignalHire: Integrations & API) sent as an
// `apikey` header. Search (POST /candidate/searchByQuery) finds profiles by
// title/company/location, returns no contact details, and draws from a daily
// quota rather than credits; enrichment (POST /candidate/search) reveals
// emails/phones at a credit per successful match. Enrichment normally
// delivers results to a webhook callback, which Calyflow can't receive, so we
// send `withoutWaterfall: true` for a synchronous response — instant results
// from already-indexed data, occasionally fewer contacts than the async
// waterfall would surface.
const API = "https://www.signalhire.com/api/v1";

const DEFAULT_PAGE_SIZE = 10;
const HARD_PAGE_SIZE = 25;
const CHAR_CAP = 12_000;

interface SignalHireExperience {
  position?: string | null;
  title?: string | null;
  company?: string | null;
  current?: boolean | null;
}

interface SignalHireContact {
  type?: string | null;
  value?: string | null;
  subType?: string | null;
  rating?: string | null;
}

export interface SignalHireProfile {
  uid?: string | null;
  fullName?: string | null;
  location?: string | null;
  locations?: { name?: string | null }[] | null;
  experience?: SignalHireExperience[] | null;
  contacts?: SignalHireContact[] | null;
  openToWork?: boolean | null;
  social?: { type?: string | null; link?: string | null }[] | null;
}

interface SignalHireEnrichResult {
  item?: string | null;
  status?: string | null;
  candidate?: SignalHireProfile | null;
}

export interface SignalHireAdapter extends ConnectorAdapter {
  searchPeople(
    apiKey: string,
    args: {
      title?: string;
      company?: string;
      location?: string;
      keywords?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  enrichPerson(
    apiKey: string,
    args: { identifier: string },
  ): Promise<{ text: string; found: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  return { apikey: apiKey, Accept: "application/json" };
}

function fail(res: Response, json: unknown): never {
  const detail =
    (json as { message?: string } | null)?.message ??
    (json as { error?: string } | null)?.error ??
    res.statusText;
  throw new Error(`SignalHire error (${res.status}): ${detail}`);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function currentRole(p: SignalHireProfile): SignalHireExperience | undefined {
  const exp = p.experience ?? [];
  return exp.find((e) => e.current) ?? exp[0];
}

function positionOf(e?: SignalHireExperience): string {
  return e?.position ?? e?.title ?? "";
}

function locationOf(p: SignalHireProfile): string {
  return (
    p.location ??
    (p.locations ?? [])
      .map((l) => l.name)
      .filter(Boolean)
      .join("; ")
  );
}

function renderCandidate(p: SignalHireProfile): { text: string; found: boolean } {
  const role = currentRole(p);
  const header = [
    `**${p.fullName ?? "Unknown"}**`,
    positionOf(role) ? `— ${positionOf(role)}` : "",
    role?.company ? `at ${role.company}` : "",
    locationOf(p) ? `· ${locationOf(p)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const contacts = p.contacts ?? [];
  const emails = contacts
    .filter((c) => c.type === "email" && c.value)
    .map(
      (c) =>
        `${c.value}${c.subType || c.rating ? ` (${[c.subType, c.rating].filter(Boolean).join(", ")})` : ""}`,
    );
  const phones = contacts
    .filter((c) => c.type === "phone" && c.value)
    .map((c) => `${c.value}${c.subType ? ` (${c.subType})` : ""}`);
  const linkedin = (p.social ?? []).find(
    (s) => s.type === "li" || s.type === "linkedin",
  )?.link;
  const detail = [
    emails.length ? `Emails: ${emails.join(", ")}` : null,
    phones.length ? `Phones: ${phones.join(", ")}` : null,
    linkedin ? `LinkedIn: ${linkedin}` : null,
    p.uid ? `Profile uid: ${p.uid}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const found = emails.length + phones.length > 0;
  return {
    text: `${header}\n${detail}${found ? "" : "\n_No contact details returned._"}`,
    found,
  };
}

export const signalhireAdapter: SignalHireAdapter = {
  provider: "signalhire",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const res = await fetch(`${API}/credits`, { headers: headers(apiKey) });
      const json = (await res.json().catch(() => null)) as {
        credits?: number;
      } | null;
      if (!res.ok) fail(res, json);
      return {
        ok: true,
        accountLabel:
          typeof json?.credits === "number"
            ? `SignalHire (${json.credits} credits)`
            : "SignalHire",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchPeople(apiKey, args) {
    const body: Record<string, unknown> = {};
    if (args.title) body.currentTitle = args.title;
    if (args.company) body.currentCompany = args.company;
    if (args.location) body.location = args.location;
    if (args.keywords) body.keywords = args.keywords;
    if (Object.keys(body).length === 0) {
      return {
        text: "Provide at least one search filter: title, company, location, or keywords.",
        count: 0,
        truncated: false,
      };
    }
    body.size = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, HARD_PAGE_SIZE);
    const res = await fetch(`${API}/candidate/searchByQuery`, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      profiles?: SignalHireProfile[];
      total?: number;
    } | null;
    if (!res.ok) fail(res, json);
    const profiles = json?.profiles ?? [];
    const lines = [
      "| Name | Title | Company | Location | Open to work | UID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const p of profiles) {
      const role = currentRole(p);
      lines.push(
        `| ${cell(p.fullName)} | ${cell(positionOf(role))} | ${cell(
          role?.company,
        )} | ${cell(locationOf(p))} | ${p.openToWork ? "yes" : ""} | ${cell(p.uid)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json?.total ?? profiles.length;
    return {
      text: profiles.length
        ? `${lines.join("\n")}\n\n_${total} total matches. Search shows no contact details — use signalhire_enrich_person (costs a credit per match) on the people you actually need, passing the UID._`
        : "_No profiles found._",
      count: profiles.length,
      truncated: truncated || total > profiles.length,
    };
  },

  async enrichPerson(apiKey, args) {
    const identifier = args.identifier?.trim();
    if (!identifier) {
      return {
        text: "Provide an identifier: a LinkedIn profile URL, an email, a phone number, or a profile uid from signalhire_search_people.",
        found: false,
      };
    }
    const res = await fetch(`${API}/candidate/search`, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ items: [identifier], withoutWaterfall: true }),
    });
    const json = (await res.json().catch(() => null)) as
      | SignalHireEnrichResult[]
      | null;
    if (!res.ok) fail(res, json);
    const result = Array.isArray(json) ? json[0] : null;
    if (!result) {
      return { text: "No result returned for that identifier.", found: false };
    }
    switch (result.status) {
      case "success":
        return result.candidate
          ? renderCandidate(result.candidate)
          : { text: "Match reported but no profile data returned.", found: false };
      case "failed":
        return { text: "No match found for that identifier.", found: false };
      case "credits_are_over":
        return {
          text: "SignalHire credits are exhausted — top up in SignalHire to keep enriching.",
          found: false,
        };
      case "timeout_exceeded":
        return {
          text: "SignalHire timed out processing this identifier. Try once more after working on something else.",
          found: false,
        };
      case "duplicate_query":
        return {
          text: "This identifier was just looked up — reuse the earlier result instead of re-enriching.",
          found: false,
        };
      default:
        return {
          text: `Lookup returned status "${result.status ?? "unknown"}" with no contact details.`,
          found: false,
        };
    }
  },
};
