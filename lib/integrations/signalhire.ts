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

// Ladder ceilings. SignalHire search is FREE (daily quota, not credits), so the
// budget here is a call-count guard rather than a spend cap.
const HARD_MAX_SEARCHES = 24; // total searchByQuery calls one ladder run may make
const MAX_TIER_SEARCHES = 10; // cap a single tier's title×company fan-out
const LADDER_CHAR_CAP = 14_000;

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

/** One flat SignalHire search — the shape searchByQuery accepts. */
export interface SignalHireSearchArgs {
  title?: string;
  company?: string;
  location?: string;
  keywords?: string;
  limit?: number;
}

/** The search intent the Sourcing agent passes to the ladder — title tiers +
 *  skills/filters, mirroring the Sourcing Plan. The tier→search mapping lives in
 *  the spec, not here. */
export interface SignalHireSourceArgs {
  currentTitles: string[];
  adjacentTitles?: string[];
  skills?: string[];
  keywords?: string;
  companies?: string[];
  location?: string;
  targetCount?: number;
  maxSearches?: number;
}

/** One ladder tier for SignalHire. Because SignalHire's search fields are
 *  single-valued, a tier "fans out" a list field (titles or companies) into one
 *  search per value; the interpreter (buildSignalHireTierSearches) holds NO
 *  strategy — which fields/order/weights to use lives in the private spec. */
export interface SignalHireLadderTier {
  name: string;
  weight: number;
  /** Intent list field → one search per value in `title`. */
  titlesFrom?: string;
  /** Intent list field → one search per value in `company`. */
  companiesFrom?: string;
  /** Intent fields (string or list) flattened into the `keywords` string. */
  keywordsFrom?: string[];
  /** How to join multiple keyword terms (default AND). */
  keywordsJoin?: "AND" | "OR";
  /** Constrain to the intent location. */
  useLocation?: boolean;
  /** Page size for this tier's searches — precise tiers can pull more, broad
   *  tiers fewer (keeps payloads small + fast). Defaults to spec.defaults.limit. */
  limit?: number;
  /** Cap this single tier's title×company fan-out (defaults to spec-wide cap). */
  maxSearches?: number;
}

export interface SignalHireLadderSpec {
  defaults: {
    targetCount: number;
    maxSearches: number;
    /** Page size when a tier doesn't set its own. */
    limit?: number;
    /** How many searches to run concurrently (speed). */
    concurrency?: number;
  };
  tiers: SignalHireLadderTier[];
}

export interface SignalHireAdapter extends ConnectorAdapter {
  searchPeople(
    apiKey: string,
    args: SignalHireSearchArgs,
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  sourcePeople(
    apiKey: string,
    args: SignalHireSourceArgs,
    spec: SignalHireLadderSpec,
    record?: (searches: number, detail?: unknown) => Promise<void> | void,
  ): Promise<{ text: string; count: number; truncated: boolean; searches: number }>;
  enrichPerson(
    apiKey: string,
    args: { identifier: string },
  ): Promise<{ text: string; found: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  return { apikey: apiKey, Accept: "application/json" };
}

const clampInt = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.floor(n)));

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

const TABLE_HEADER = [
  "| Name | Title | Company | Location | Open to work | UID |",
  "| --- | --- | --- | --- | --- | --- |",
];

/** One markdown table row for a profile (shared by search + ladder). */
function profileRow(p: SignalHireProfile): string {
  const role = currentRole(p);
  return `| ${cell(p.fullName)} | ${cell(positionOf(role))} | ${cell(
    role?.company,
  )} | ${cell(locationOf(p))} | ${p.openToWork ? "yes" : ""} | ${cell(p.uid)} |`;
}

/** The low-level searchByQuery call, returning raw profiles + total. Shared by
 *  searchPeople (renders a table) and the ladder (dedupes across tiers). */
async function rawSearchByQuery(
  apiKey: string,
  args: SignalHireSearchArgs,
): Promise<{ profiles: SignalHireProfile[]; total: number }> {
  const body: Record<string, unknown> = {};
  if (args.title) body.currentTitle = args.title;
  if (args.company) body.currentCompany = args.company;
  if (args.location) body.location = args.location;
  if (args.keywords) body.keywords = args.keywords;
  if (Object.keys(body).length === 0) return { profiles: [], total: 0 };
  body.size = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, HARD_PAGE_SIZE);
  const payload = JSON.stringify(body);
  const res = await fetch(`${API}/candidate/searchByQuery`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: payload,
  });
  const json = (await res.json().catch(() => null)) as {
    profiles?: SignalHireProfile[];
    total?: number;
  } | null;
  // Debug: log the exact request payload + outcome so a "0 results" run can be
  // diagnosed (bad field names, unsupported boolean syntax, location format…).
  const profileCount = json?.profiles?.length ?? 0;
  console.log(
    `[signalhire] POST /candidate/searchByQuery status=${res.status} ` +
      `payload=${payload} → profiles=${profileCount} total=${json?.total ?? "?"}`,
  );
  if (!res.ok || profileCount === 0) {
    console.log(
      `[signalhire] raw response: ${JSON.stringify(json).slice(0, 800)}`,
    );
  }
  if (!res.ok) fail(res, json);
  const profiles = json?.profiles ?? [];
  return { profiles, total: json?.total ?? profiles.length };
}

// --- Ladder interpreter (strategy-free) ------------------------------------
// Expands a tier into flat SignalHire searches. Holds NO strategy — which
// fields/order/weights to use lives in the private spec.

/** Trimmed, non-empty values for an intent field: string → [string], list →
 *  filtered, else []. */
function valuesOf(args: SignalHireSourceArgs, key?: string): string[] {
  if (!key) return [];
  const raw = (args as unknown as Record<string, unknown>)[key];
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  }
  return [];
}

/** Build the keyword string for a tier from its source fields. */
function keywordsFor(tier: SignalHireLadderTier, args: SignalHireSourceArgs): string {
  const terms = (tier.keywordsFrom ?? []).flatMap((f) => valuesOf(args, f));
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  const join = tier.keywordsJoin ?? "AND";
  return terms.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(` ${join} `);
}

/** Expand one tier into the flat searches it should run — one per title×company
 *  combination (SignalHire fields are single-valued). Returns [] when the tier
 *  has no usable inputs, so the driver skips it instead of searching everything.
 *  Exported for unit tests. */
export function buildSignalHireTierSearches(
  tier: SignalHireLadderTier,
  args: SignalHireSourceArgs,
): SignalHireSearchArgs[] {
  const titles = tier.titlesFrom ? valuesOf(args, tier.titlesFrom) : [undefined];
  const companies = tier.companiesFrom
    ? valuesOf(args, tier.companiesFrom)
    : [undefined];
  // A declared fan-out field that yields no values means this tier can't run.
  if (tier.titlesFrom && titles.length === 0) return [];
  if (tier.companiesFrom && companies.length === 0) return [];

  const keywords = keywordsFor(tier, args) || undefined;
  const location =
    tier.useLocation && args.location?.trim() ? args.location.trim() : undefined;
  const limit = tier.limit;
  const tierCap = Math.min(tier.maxSearches ?? MAX_TIER_SEARCHES, MAX_TIER_SEARCHES);

  const searches: SignalHireSearchArgs[] = [];
  for (const title of titles) {
    for (const company of companies) {
      // Drop searches with no meaningful constraint (location alone is too broad).
      if (!title && !company && !keywords) continue;
      searches.push({ title, company, keywords, location, limit });
      if (searches.length >= tierCap) return searches;
    }
  }
  return searches;
}

/** A stable key for a flat search, so identical queries across tiers run once. */
function searchKey(s: SignalHireSearchArgs): string {
  return [s.title ?? "", s.company ?? "", s.keywords ?? "", s.location ?? ""]
    .join("|")
    .toLowerCase();
}

/** Run async tasks with bounded concurrency, preserving input order in results. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
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
    if (!args.title && !args.company && !args.location && !args.keywords) {
      return {
        text: "Provide at least one search filter: title, company, location, or keywords.",
        count: 0,
        truncated: false,
      };
    }
    const { profiles, total } = await rawSearchByQuery(apiKey, args);
    const lines = [...TABLE_HEADER];
    let truncated = false;
    for (const p of profiles) {
      lines.push(profileRow(p));
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: profiles.length
        ? `${lines.join("\n")}\n\n_${total} total matches. Search shows no contact details — use signalhire_enrich_person (costs a credit per match) on the people you actually need, passing the UID._`
        : "_No profiles found._",
      count: profiles.length,
      truncated: truncated || total > profiles.length,
    };
  },

  async sourcePeople(apiKey, args, spec, record) {
    // Debug: the intent the agent passed, so we can see how it maps to searches.
    console.log(`[signalhire] ladder intent: ${JSON.stringify(args)}`);
    const target = clampInt(
      args.targetCount ?? spec.defaults.targetCount,
      1,
      100,
    );
    const maxSearches = clampInt(
      args.maxSearches ?? spec.defaults.maxSearches,
      1,
      HARD_MAX_SEARCHES,
    );

    const concurrency = clampInt(spec.defaults.concurrency ?? 4, 1, 8);

    // uid → first tier that surfaced the profile (for weight-ranking) + profile.
    const seen = new Map<
      string,
      { tier: string; weight: number; rank: number; profile: SignalHireProfile }
    >();
    // Identical queries can be produced by more than one tier — run each once.
    const ranQueries = new Set<string>();
    let searchesRun = 0;
    const tierLog: string[] = [];
    let firstError: string | null = null;

    // Tiers run in order (highest-weight first) so we can early-stop once the
    // target is met; WITHIN a tier the searches run concurrently for speed —
    // SignalHire search is free, so the only budget is call count + the daily
    // quota, both honoured by maxSearches.
    for (const tier of spec.tiers) {
      if (seen.size >= target || searchesRun >= maxSearches) break;

      const searches = buildSignalHireTierSearches(tier, args).filter((s) => {
        const k = searchKey(s);
        if (ranQueries.has(k)) return false;
        ranQueries.add(k);
        return true;
      });
      if (searches.length === 0) continue;

      const batch = searches.slice(0, maxSearches - searchesRun);
      const batchResults = await mapPool(batch, concurrency, async (s) => {
        try {
          const r = await rawSearchByQuery(apiKey, {
            ...s,
            limit: s.limit ?? HARD_PAGE_SIZE,
          });
          return r.profiles;
        } catch (error) {
          if (firstError === null) {
            firstError = error instanceof Error ? error.message : "search failed";
          }
          return [] as SignalHireProfile[];
        }
      });
      searchesRun += batch.length;

      let addedInTier = 0;
      for (const profiles of batchResults) {
        profiles.forEach((p, i) => {
          const uid = p.uid?.trim();
          if (!uid || seen.has(uid)) return;
          seen.set(uid, {
            tier: tier.name,
            weight: tier.weight,
            rank: i,
            profile: p,
          });
          addedInTier++;
        });
      }
      tierLog.push(`${tier.name} ${batch.length}q↦+${addedInTier}`);
    }

    // Every search errored (e.g. a bad key) — surface it instead of a silent
    // empty result that would push the agent onto web search.
    if (seen.size === 0 && firstError) {
      return {
        text: `_SignalHire ladder couldn't run (${firstError})._`,
        count: 0,
        truncated: false,
        searches: searchesRun,
      };
    }

    // Rank by tier weight, then in-tier position; take the top `target`.
    const ranked = [...seen.values()]
      .sort((a, b) => b.weight - a.weight || a.rank - b.rank)
      .slice(0, target);

    if (record && searchesRun > 0) {
      // Search is free (daily quota, no credits): record 0 spend, but log the
      // call count + yield for the run trace's detail.
      await record(searchesRun, { tiers: tierLog, unique: seen.size });
    }

    const lines = [...TABLE_HEADER];
    let truncated = false;
    for (const { profile } of ranked) {
      lines.push(profileRow(profile));
      if (lines.join("\n").length > LADDER_CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const header = `_SignalHire ladder — ${
      tierLog.join(" · ") || "no tiers run"
    }. ${seen.size} unique across ${searchesRun} free searches (no credits). ` +
      `Search shows no contacts — use signalhire_enrich_person on the ones you pick._`;
    return {
      text: ranked.length
        ? `${header}\n\n${lines.join("\n")}`
        : `${header}\n\n_No profiles found._`,
      count: ranked.length,
      truncated: truncated || seen.size > ranked.length,
      searches: searchesRun,
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
