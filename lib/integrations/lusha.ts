import "server-only";
import type { ConnectorAdapter } from "./types";

// Lusha (B2B contact data). Auth is an API key sent in the `api_key` header
// (Lusha dashboard → Enrich → API). Uses the v3 two-step flow: contact search
// returns a non-PII preview — who matched, which data points exist (`has`),
// and what each reveal costs (`canReveal`) — then enrich-by-id reveals emails
// and phones, billed per datapoint. v2 is marked for deprecation; don't use it.
const API = "https://api.lusha.com";

const MAX_ENRICH_IDS = 10;
const CHAR_CAP = 12_000;

interface LushaJobTitle {
  title?: string | null;
  seniority?: string | null;
}

interface LushaCompany {
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
}

interface LushaLocation {
  city?: string | null;
  country?: string | null;
}

interface LushaSearchResult {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: LushaJobTitle | null;
  company?: LushaCompany | null;
  location?: LushaLocation | null;
  socialLinks?: { linkedin?: string | null } | null;
  has?: string[] | null;
  canReveal?: { field?: string | null; credits?: number | null }[] | null;
  error?: { code?: string | null; message?: string | null } | null;
}

interface LushaEnrichResult {
  id?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emails?: { email?: string | null; type?: string | null; confidence?: string | number | null }[] | null;
  phones?: { number?: string | null; type?: string | null }[] | null;
  jobTitle?: LushaJobTitle | null;
  company?: LushaCompany | null;
  location?: LushaLocation | null;
  socialLinks?: { linkedin?: string | null } | null;
}

export interface LushaAdapter extends ConnectorAdapter {
  searchPerson(
    apiKey: string,
    args: {
      linkedinUrl?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      companyDomain?: string;
    },
  ): Promise<{ text: string; found: boolean }>;
  enrichContacts(
    apiKey: string,
    args: { ids: string[]; reveal?: ("emails" | "phones")[] },
  ): Promise<{ text: string; count: number }>;
}

async function post<T>(
  apiKey: string,
  path: string,
  body?: Record<string, unknown>,
  method = "POST",
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      api_key: apiKey,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Lusha error (${res.status}): ${detail}`);
  }
  return json as T;
}

function nameOf(r: { fullName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  return (
    r.fullName ?? [r.firstName, r.lastName].filter(Boolean).join(" ") ?? ""
  );
}

function headerLine(r: LushaSearchResult | LushaEnrichResult): string {
  const location = [r.location?.city, r.location?.country]
    .filter(Boolean)
    .join(", ");
  return [
    `**${nameOf(r) || "Unknown"}**`,
    r.jobTitle?.title ? `— ${r.jobTitle.title}` : "",
    r.company?.name ? `at ${r.company.name}` : "",
    location ? `· ${location}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const lushaAdapter: LushaAdapter = {
  provider: "lusha",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      // Free read of usage/credits; doesn't consume credits.
      await post<unknown>(apiKey, "/v3/account/usage", undefined, "GET");
      return { ok: true, accountLabel: "Lusha account" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchPerson(apiKey, args) {
    const hasName = args.firstName && args.lastName;
    const hasAnchor = args.companyName || args.companyDomain;
    if (!args.linkedinUrl && !args.email && !(hasName && hasAnchor)) {
      return {
        text: "Provide a linkedinUrl, an email, or firstName + lastName plus companyName/companyDomain.",
        found: false,
      };
    }
    const contact: Record<string, unknown> = {};
    if (args.linkedinUrl) contact.linkedinUrl = args.linkedinUrl;
    else if (args.email) contact.email = args.email;
    else {
      contact.firstName = args.firstName;
      contact.lastName = args.lastName;
      if (args.companyName) contact.companyName = args.companyName;
      if (args.companyDomain) contact.companyDomain = args.companyDomain;
    }
    const json = await post<{ results?: LushaSearchResult[] }>(
      apiKey,
      "/v3/contacts/search",
      { contacts: [contact] },
    );
    const r = json.results?.[0];
    if (!r || r.error || !r.id) {
      return {
        text: r?.error?.message ?? "No match found for that person.",
        found: false,
      };
    }
    const reveal = (r.canReveal ?? [])
      .map((c) =>
        c.field ? `${c.field}${c.credits != null ? ` (${c.credits} cr)` : ""}` : "",
      )
      .filter(Boolean)
      .join(", ");
    const lines = [
      headerLine(r),
      r.socialLinks?.linkedin ? `LinkedIn: ${r.socialLinks.linkedin}` : null,
      r.has?.length ? `Has: ${r.has.join(", ")}` : null,
      reveal ? `Can reveal: ${reveal}` : null,
      `Contact ID: ${r.id} (use with lusha_enrich_contacts to reveal)`,
    ].filter(Boolean);
    return { text: lines.join("\n"), found: true };
  },

  async enrichContacts(apiKey, args) {
    if (!args.ids?.length) {
      return {
        text: "Provide contact ids (from lusha_search_person).",
        count: 0,
      };
    }
    const json = await post<{ results?: LushaEnrichResult[] }>(
      apiKey,
      "/v3/contacts/enrich",
      {
        ids: args.ids.slice(0, MAX_ENRICH_IDS),
        reveal: args.reveal ?? ["emails", "phones"],
      },
    );
    const results = json.results ?? [];
    if (results.length === 0) return { text: "_No contacts revealed._", count: 0 };
    const blocks: string[] = [];
    for (const r of results) {
      const emails = (r.emails ?? [])
        .map((e) =>
          e.email
            ? `${e.email}${e.type ? ` (${e.type})` : ""}`
            : "",
        )
        .filter(Boolean)
        .join(", ");
      const phones = (r.phones ?? [])
        .map((p) => (p.number ? `${p.number}${p.type ? ` (${p.type})` : ""}` : ""))
        .filter(Boolean)
        .join(", ");
      blocks.push(
        [
          headerLine(r),
          emails ? `Emails: ${emails}` : null,
          phones ? `Phones: ${phones}` : null,
          r.socialLinks?.linkedin ? `LinkedIn: ${r.socialLinks.linkedin}` : null,
          !emails && !phones ? "_No contact details returned._" : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if (blocks.join("\n\n").length > CHAR_CAP) break;
    }
    return { text: blocks.join("\n\n"), count: results.length };
  },
};
