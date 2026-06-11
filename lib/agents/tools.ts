import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "../db";
import { listDocuments, getDocument } from "../queries";
import { airtableAdapter } from "../integrations/airtable";
import { apolloAdapter } from "../integrations/apollo";
import { ashbyAdapter } from "../integrations/ashby";
import { breezyhrAdapter } from "../integrations/breezyhr";
import { brightdataAdapter } from "../integrations/brightdata";
import { contactoutAdapter } from "../integrations/contactout";
import { greenhouseAdapter } from "../integrations/greenhouse";
import { hubspotAdapter } from "../integrations/hubspot";
import { hunterAdapter } from "../integrations/hunter";
import type { Doc } from "../types";

// Agent tools. Each tool's execute closes over a server-derived ToolContext —
// scope (workspace/project) is NEVER taken from model-provided arguments, so a
// prompt-injected agent can't reach another workspace's data.

export interface ToolContext {
  workspaceId: string;
  projectId: string;
  clientId: string;
  userId: string;
  /** Valid access tokens per connector, or null when not connected. */
  airtableToken: string | null;
  apolloToken: string | null;
  ashbyToken: string | null;
  breezyhrToken: string | null;
  brightdataToken: string | null;
  contactoutToken: string | null;
  greenhouseToken: string | null;
  hubspotToken: string | null;
  hunterToken: string | null;
  /** Documents the agent created this run (mutated by calyflow_create_document). */
  createdDocIds: string[];
}

const READ_DOC_CHAR_CAP = 8_000;
const notConnected = (name: string) =>
  `${name} is not connected for this workspace. Ask an admin to connect it in Settings → Connectors.`;

function snippet(text: string, query: string): string {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, i - 80);
  return text.slice(start, start + 240).replace(/\s+/g, " ").trim();
}

function buildAll(ctx: ToolContext): ToolSet {
  return {
    calyflow_search_documents: tool({
      description:
        "Search the project's knowledge base (workspace, client and project documents) for text matching a query. Returns matching documents with id and a snippet. Use this to ground your work before querying external sources.",
      inputSchema: z.object({
        query: z.string().describe("Keywords or phrase to search for."),
      }),
      execute: async ({ query }) => {
        const [wsKb, clientKb, clientFiles, projectFiles] = await Promise.all([
          listDocuments(ctx.workspaceId, "workspace", ctx.workspaceId, "kb"),
          listDocuments(ctx.workspaceId, "client", ctx.clientId, "kb"),
          listDocuments(ctx.workspaceId, "client", ctx.clientId, "file"),
          listDocuments(ctx.workspaceId, "project", ctx.projectId, "file"),
        ]);
        const all: Doc[] = [...wsKb, ...clientKb, ...clientFiles, ...projectFiles];
        const q = query.toLowerCase();
        const hits = all
          .filter(
            (d) =>
              d.is_active &&
              d.extracted_text &&
              d.extracted_text.toLowerCase().includes(q),
          )
          .slice(0, 10)
          .map((d) => ({
            documentId: d.id,
            filename: d.filename ?? "Untitled",
            scope: d.scope_type,
            docType: d.doc_type,
            snippet: snippet(d.extracted_text ?? "", query),
          }));
        return { matches: hits };
      },
    }),

    calyflow_read_document: tool({
      description:
        "Read the full text of a knowledge-base document by its id (from calyflow_search_documents).",
      inputSchema: z.object({
        documentId: z.string(),
      }),
      execute: async ({ documentId }) => {
        const doc = await getDocument(ctx.workspaceId, documentId);
        if (!doc) return { error: "Document not found." };
        const text = doc.extracted_text ?? "";
        return {
          filename: doc.filename ?? "Untitled",
          text: text.slice(0, READ_DOC_CHAR_CAP),
          truncated: text.length > READ_DOC_CHAR_CAP,
        };
      },
    }),

    airtable_list_bases: tool({
      description: "List the Airtable bases the connection can access.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.airtableToken) return { error: notConnected("Airtable") };
        return { bases: await airtableAdapter.listBases(ctx.airtableToken) };
      },
    }),

    airtable_list_tables: tool({
      description: "List the tables in an Airtable base.",
      inputSchema: z.object({
        baseId: z.string().describe("Airtable base id (from airtable_list_bases)."),
      }),
      execute: async ({ baseId }) => {
        if (!ctx.airtableToken) return { error: notConnected("Airtable") };
        return {
          tables: await airtableAdapter.listTables(ctx.airtableToken, baseId),
        };
      },
    }),

    airtable_query_records: tool({
      description:
        "Query records from an Airtable table, returned as a Markdown table. Use filterFormula (Airtable formula syntax) to narrow results. Start narrow and refine.",
      inputSchema: z.object({
        baseId: z.string(),
        tableId: z.string().describe("Table id or name."),
        filterFormula: z
          .string()
          .optional()
          .describe('Airtable formula, e.g. {Status} = "Active".'),
        maxRecords: z.number().int().positive().optional(),
      }),
      execute: async ({ baseId, tableId, filterFormula, maxRecords }) => {
        if (!ctx.airtableToken) return { error: notConnected("Airtable") };
        return airtableAdapter.queryRecords(ctx.airtableToken, {
          baseId,
          tableId,
          filterFormula,
          maxRecords,
        });
      },
    }),

    ashby_list_jobs: tool({
      description:
        "List jobs/requisitions in the connected Ashby ATS (title, status, location, job id). Use to find the role you are sourcing for.",
      inputSchema: z.object({
        openOnly: z
          .boolean()
          .optional()
          .describe("Only return jobs with status Open."),
      }),
      execute: async ({ openOnly }) => {
        if (!ctx.ashbyToken) return { error: notConnected("Ashby") };
        return ashbyAdapter.listJobs(ctx.ashbyToken, { openOnly });
      },
    }),

    ashby_list_candidates: tool({
      description:
        "List candidates from the connected Ashby ATS as a Markdown table (name, email, location, company, title). Paginated; use limit to control volume.",
      inputSchema: z.object({
        limit: z.number().int().positive().optional(),
      }),
      execute: async ({ limit }) => {
        if (!ctx.ashbyToken) return { error: notConnected("Ashby") };
        return ashbyAdapter.listCandidates(ctx.ashbyToken, { limit });
      },
    }),

    ashby_search_candidates: tool({
      description:
        "Search Ashby candidates by name or email. Returns matching candidates as a Markdown table.",
      inputSchema: z.object({
        query: z.string().describe("A candidate name or email to search for."),
      }),
      execute: async ({ query }) => {
        if (!ctx.ashbyToken) return { error: notConnected("Ashby") };
        return ashbyAdapter.searchCandidates(ctx.ashbyToken, { query });
      },
    }),

    breezyhr_list_positions: tool({
      description:
        "List positions/requisitions in the connected BreezyHR ATS (name, state, department, location, position id). Use to find the role you are sourcing for. Operates on the account's first company unless companyId is given.",
      inputSchema: z.object({
        state: z
          .string()
          .optional()
          .describe(
            'Filter by position state, e.g. "published" for live roles, "draft", "closed".',
          ),
        companyId: z
          .string()
          .optional()
          .describe("BreezyHR company id, only needed for multi-company accounts."),
      }),
      execute: async (args) => {
        if (!ctx.breezyhrToken) return { error: notConnected("BreezyHR") };
        return breezyhrAdapter.listPositions(ctx.breezyhrToken, args);
      },
    }),

    breezyhr_list_candidates: tool({
      description:
        "List the candidates in a BreezyHR position's pipeline as a Markdown table (name, email, phone, headline, stage, origin). BreezyHR scopes candidates to a position — get the positionId from breezyhr_list_positions first.",
      inputSchema: z.object({
        positionId: z
          .string()
          .describe("Position id (from breezyhr_list_positions)."),
        companyId: z
          .string()
          .optional()
          .describe("BreezyHR company id, only needed for multi-company accounts."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.breezyhrToken) return { error: notConnected("BreezyHR") };
        return breezyhrAdapter.listCandidates(ctx.breezyhrToken, args);
      },
    }),

    breezyhr_search_candidates: tool({
      description:
        "Search BreezyHR candidates across positions by exact email address. Returns matching candidates as a Markdown table.",
      inputSchema: z.object({
        email: z.string().describe("The candidate email address to search for."),
        companyId: z
          .string()
          .optional()
          .describe("BreezyHR company id, only needed for multi-company accounts."),
      }),
      execute: async (args) => {
        if (!ctx.breezyhrToken) return { error: notConnected("BreezyHR") };
        return breezyhrAdapter.searchCandidates(ctx.breezyhrToken, args);
      },
    }),

    greenhouse_list_jobs: tool({
      description:
        "List jobs/requisitions in the connected Greenhouse ATS (name, status, department, office, job id). Use to find the role you are sourcing for.",
      inputSchema: z.object({
        openOnly: z
          .boolean()
          .optional()
          .describe("Only return jobs with status open."),
      }),
      execute: async (args) => {
        if (!ctx.greenhouseToken) return { error: notConnected("Greenhouse") };
        return greenhouseAdapter.listJobs(ctx.greenhouseToken, args);
      },
    }),

    greenhouse_list_candidates: tool({
      description:
        "List candidates from the connected Greenhouse ATS as a Markdown table (name, email, company, title, job, stage). Pass jobId (from greenhouse_list_jobs) to scope to one role's pipeline; paginated, use limit to control volume.",
      inputSchema: z.object({
        jobId: z
          .string()
          .optional()
          .describe("Greenhouse job id to scope candidates to one role."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.greenhouseToken) return { error: notConnected("Greenhouse") };
        return greenhouseAdapter.listCandidates(ctx.greenhouseToken, args);
      },
    }),

    greenhouse_search_candidates: tool({
      description:
        "Search Greenhouse candidates by exact email address. Returns matching candidates as a Markdown table.",
      inputSchema: z.object({
        email: z.string().describe("The candidate email address to search for."),
      }),
      execute: async (args) => {
        if (!ctx.greenhouseToken) return { error: notConnected("Greenhouse") };
        return greenhouseAdapter.searchCandidates(ctx.greenhouseToken, args);
      },
    }),

    hubspot_search_contacts: tool({
      description:
        "Search contacts in the connected HubSpot CRM by name, email, or other text (name, email, title, company, phone). Omit query to list recent contacts.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Free-text search, e.g. a name, email, or company."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.hubspotToken) return { error: notConnected("HubSpot") };
        return hubspotAdapter.searchContacts(ctx.hubspotToken, args);
      },
    }),

    hubspot_search_companies: tool({
      description:
        "Search companies in the connected HubSpot CRM by name or domain (name, domain, industry, location, employee count). Omit query to list recent companies.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Free-text search, e.g. a company name or domain."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.hubspotToken) return { error: notConnected("HubSpot") };
        return hubspotAdapter.searchCompanies(ctx.hubspotToken, args);
      },
    }),

    hubspot_search_deals: tool({
      description:
        "Search deals in the connected HubSpot CRM by name (deal name, amount, stage, pipeline, close date). Omit query to list recent deals.",
      inputSchema: z.object({
        query: z.string().optional().describe("Free-text search, e.g. a deal or client name."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.hubspotToken) return { error: notConnected("HubSpot") };
        return hubspotAdapter.searchDeals(ctx.hubspotToken, args);
      },
    }),

    hunter_domain_search: tool({
      description:
        "Find people at a company via Hunter.io — pass a company domain (e.g. acme.com) or company name, optionally filtered by department and/or seniority to target specific roles/functions. Returns name, position, department, seniority, email, and confidence.",
      inputSchema: z.object({
        domain: z
          .string()
          .optional()
          .describe("Company domain, e.g. acme.com (preferred)."),
        company: z
          .string()
          .optional()
          .describe("Company name, if the domain isn't known."),
        department: z
          .string()
          .optional()
          .describe(
            "Comma-separated departments: executive, it, finance, management, sales, legal, support, hr, marketing, communication, education, design, health, operations.",
          ),
        seniority: z
          .string()
          .optional()
          .describe("Comma-separated seniority: junior, senior, executive."),
        type: z.enum(["personal", "generic"]).optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.hunterToken) return { error: notConnected("Hunter.io") };
        return hunterAdapter.domainSearch(ctx.hunterToken, args);
      },
    }),

    hunter_email_finder: tool({
      description:
        "Find a specific person's email address at a company via Hunter.io. Provide their name and the company domain (or company name).",
      inputSchema: z.object({
        domain: z.string().optional().describe("Company domain, e.g. acme.com."),
        company: z.string().optional(),
        fullName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      }),
      execute: async (args) => {
        if (!ctx.hunterToken) return { error: notConnected("Hunter.io") };
        return hunterAdapter.emailFinder(ctx.hunterToken, args);
      },
    }),

    hunter_email_verifier: tool({
      description:
        "Verify the deliverability of an email address via Hunter.io. Returns a result (deliverable/risky/undeliverable) and score.",
      inputSchema: z.object({
        email: z.string().describe("The email address to verify."),
      }),
      execute: async ({ email }) => {
        if (!ctx.hunterToken) return { error: notConnected("Hunter.io") };
        return hunterAdapter.emailVerifier(ctx.hunterToken, email);
      },
    }),

    apollo_search_people: tool({
      description:
        "Search Apollo's B2B database for people at target companies by job title, seniority, company domain/name, and location. Returns name, title, company, location, and email status as a Markdown table. NOTE: email addresses are usually masked in search results — use apollo_enrich_person to reveal a specific person's actual email.",
      inputSchema: z.object({
        domain: z
          .string()
          .optional()
          .describe("Company domain to target, e.g. acme.com (preferred)."),
        company: z
          .string()
          .optional()
          .describe("Company name, if the domain isn't known."),
        titles: z
          .array(z.string())
          .optional()
          .describe('Job titles to match, e.g. ["VP Engineering", "Head of Talent"].'),
        seniorities: z
          .array(z.string())
          .optional()
          .describe(
            'Seniority levels: owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern.',
          ),
        locations: z
          .array(z.string())
          .optional()
          .describe('Person locations, e.g. ["San Francisco, US", "London, UK"].'),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.apolloToken) return { error: notConnected("Apollo") };
        return apolloAdapter.searchPeople(ctx.apolloToken, args);
      },
    }),

    apollo_enrich_person: tool({
      description:
        "Reveal a specific person's contact details (work email, phone, LinkedIn) via Apollo's People Match. Provide their name and the company domain (or company name). Set revealEmail to surface personal emails when work email is unavailable.",
      inputSchema: z.object({
        fullName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        domain: z.string().optional().describe("Company domain, e.g. acme.com."),
        company: z.string().optional(),
        revealEmail: z
          .boolean()
          .optional()
          .describe("Reveal personal emails when no work email is found."),
      }),
      execute: async (args) => {
        if (!ctx.apolloToken) return { error: notConnected("Apollo") };
        return apolloAdapter.enrichPerson(ctx.apolloToken, args);
      },
    }),

    apollo_search_organizations: tool({
      description:
        "Find target companies in Apollo by keyword (industry/technology), location, and employee-size range. Returns company name, domain, industry, employee count, and location as a Markdown table. Use to build a target-account list before searching for people.",
      inputSchema: z.object({
        keywords: z
          .string()
          .optional()
          .describe("Keyword tags, e.g. 'fintech' or 'healthcare software'."),
        locations: z
          .array(z.string())
          .optional()
          .describe('Company HQ locations, e.g. ["United States", "Germany"].'),
        employeeRanges: z
          .array(z.string())
          .optional()
          .describe('Employee-count ranges, e.g. ["1,10", "11,50", "51,200"].'),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.apolloToken) return { error: notConnected("Apollo") };
        return apolloAdapter.searchOrganizations(ctx.apolloToken, args);
      },
    }),

    brightdata_scrape_linkedin_profiles: tool({
      description:
        "Scrape full public LinkedIn profiles (headline, current company, location, experience, about) by profile URL via Bright Data. Up to 5 URLs per call; each collected profile is billed. Scrapes can take 1–3 minutes — if the result says the collection is still running, note the snapshot id, do other work, and fetch it later with brightdata_get_snapshot.",
      inputSchema: z.object({
        urls: z
          .array(z.string())
          .describe(
            'LinkedIn profile URLs, e.g. ["https://www.linkedin.com/in/janedoe"]. Max 5 per call.',
          ),
      }),
      execute: async (args) => {
        if (!ctx.brightdataToken) return { error: notConnected("Bright Data") };
        return brightdataAdapter.scrapeLinkedinProfiles(
          ctx.brightdataToken,
          args,
        );
      },
    }),

    brightdata_scrape_linkedin_companies: tool({
      description:
        "Scrape public LinkedIn company pages (industry, size, HQ, website, about) by company URL via Bright Data. Up to 5 URLs per call; each collected record is billed. Scrapes can take 1–3 minutes — if the result says the collection is still running, fetch it later with brightdata_get_snapshot.",
      inputSchema: z.object({
        urls: z
          .array(z.string())
          .describe(
            'LinkedIn company URLs, e.g. ["https://www.linkedin.com/company/acme"]. Max 5 per call.',
          ),
      }),
      execute: async (args) => {
        if (!ctx.brightdataToken) return { error: notConnected("Bright Data") };
        return brightdataAdapter.scrapeLinkedinCompanies(
          ctx.brightdataToken,
          args,
        );
      },
    }),

    brightdata_get_snapshot: tool({
      description:
        "Fetch the results of a Bright Data collection that was still running when triggered (use the snapshot id a brightdata_scrape_* tool returned). Free to call; returns the records once ready.",
      inputSchema: z.object({
        snapshotId: z.string().describe("Snapshot id from a brightdata_scrape_* result."),
      }),
      execute: async ({ snapshotId }) => {
        if (!ctx.brightdataToken) return { error: notConnected("Bright Data") };
        return brightdataAdapter.getSnapshot(ctx.brightdataToken, snapshotId);
      },
    }),

    contactout_people_search: tool({
      description:
        "Search ContactOut's database of LinkedIn profiles by name, job title, company, location, seniority, or skills. Returns name, title, company, location, and the LinkedIn URL per person as a Markdown table. Contact details are NOT revealed by default (search is free); set revealInfo only when you need contacts for every row — it consumes email and phone credits PER PROFILE. Prefer searching first, then enriching only the selected people with contactout_linkedin_enrich.",
      inputSchema: z.object({
        name: z.string().optional().describe("Person name to search for."),
        jobTitles: z
          .array(z.string())
          .optional()
          .describe('Job titles to match, e.g. ["VP Engineering", "Head of Talent"].'),
        companies: z
          .array(z.string())
          .optional()
          .describe('Company names, e.g. ["Stripe", "Acme"].'),
        locations: z
          .array(z.string())
          .optional()
          .describe('Locations, e.g. ["San Francisco, CA", "London"].'),
        seniorities: z
          .array(z.string())
          .optional()
          .describe(
            'Seniority levels, e.g. ["director", "vice president", "c-level"].',
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe('Skills to match, e.g. ["Network Security"].'),
        page: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Result page, starting at 1."),
        revealInfo: z
          .boolean()
          .optional()
          .describe(
            "Reveal emails/phones for every returned profile. COSTS credits per profile — leave unset unless contacts are needed for all results.",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max profiles to return, up to 25 (default 10)."),
      }),
      execute: async (args) => {
        if (!ctx.contactoutToken) return { error: notConnected("ContactOut") };
        return contactoutAdapter.peopleSearch(ctx.contactoutToken, args);
      },
    }),

    contactout_linkedin_enrich: tool({
      description:
        "Get a person's contact details (work emails, personal emails, phone numbers) from their LinkedIn profile URL via ContactOut. COSTS one email credit and one phone credit per call — only enrich people you actually intend to contact. Set profileOnly to fetch the profile without contact info (no contact credits).",
      inputSchema: z.object({
        profileUrl: z
          .string()
          .describe(
            "Full LinkedIn profile URL, e.g. https://linkedin.com/in/janedoe.",
          ),
        profileOnly: z
          .boolean()
          .optional()
          .describe("Fetch the profile without revealing contacts (free)."),
      }),
      execute: async (args) => {
        if (!ctx.contactoutToken) return { error: notConnected("ContactOut") };
        return contactoutAdapter.linkedinEnrich(ctx.contactoutToken, args);
      },
    }),

    contactout_person_enrich: tool({
      description:
        "Find a person's contact details via ContactOut when you don't have their LinkedIn URL — provide their name plus at least one anchor (companies, companyDomain, jobTitle, location, or a known email). Returns work/personal emails and phones. Consumes credits per successful match.",
      inputSchema: z.object({
        fullName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        companies: z
          .array(z.string())
          .optional()
          .describe('Current or past companies, e.g. ["Stripe"].'),
        companyDomain: z
          .string()
          .optional()
          .describe("Company domain, e.g. acme.com."),
        jobTitle: z.string().optional(),
        location: z.string().optional(),
        linkedinUrl: z
          .string()
          .optional()
          .describe("If you have the LinkedIn URL, prefer contactout_linkedin_enrich."),
        email: z
          .string()
          .optional()
          .describe("A known email of theirs, to find the rest."),
        include: z
          .array(z.enum(["work_email", "personal_email", "phone"]))
          .optional()
          .describe("Contact types to reveal (defaults to all three)."),
      }),
      execute: async (args) => {
        if (!ctx.contactoutToken) return { error: notConnected("ContactOut") };
        return contactoutAdapter.personEnrich(ctx.contactoutToken, args);
      },
    }),

    contactout_email_verify: tool({
      description:
        "Verify the deliverability of an email address via ContactOut. Returns valid, invalid, accept_all, disposable, or unknown. Cheap — use before adding an email to an outreach list.",
      inputSchema: z.object({
        email: z.string().describe("The email address to verify."),
      }),
      execute: async ({ email }) => {
        if (!ctx.contactoutToken) return { error: notConnected("ContactOut") };
        return contactoutAdapter.emailVerify(ctx.contactoutToken, email);
      },
    }),

    calyflow_create_document: tool({
      description:
        "Save a Markdown document into the current project (e.g. your final analysis/summary). Returns the new document id.",
      inputSchema: z.object({
        title: z.string().describe("Short document title."),
        content: z.string().describe("Markdown body."),
      }),
      execute: async ({ title, content }) => {
        const { data, error } = await db()
          .from("documents")
          .insert({
            scope_type: "project",
            scope_id: ctx.projectId,
            workspace_id: ctx.workspaceId,
            kind: "file",
            doc_type: "output",
            source: "agent",
            filename: title,
            extracted_text: content,
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        if (error || !data) return { error: "Could not save the document." };
        ctx.createdDocIds.push(data.id as string);
        return { documentId: data.id, title };
      },
    }),
  };
}

/** Returns the AI SDK ToolSet for the agent's allowed tool names. */
export function buildTools(ctx: ToolContext, allowed: string[]): ToolSet {
  const all = buildAll(ctx);
  const set: ToolSet = {};
  for (const name of allowed) {
    if (all[name]) set[name] = all[name];
  }
  return set;
}

export const ALL_TOOL_NAMES = [
  "calyflow_search_documents",
  "calyflow_read_document",
  "airtable_list_bases",
  "airtable_list_tables",
  "airtable_query_records",
  "ashby_list_jobs",
  "ashby_list_candidates",
  "ashby_search_candidates",
  "breezyhr_list_positions",
  "breezyhr_list_candidates",
  "breezyhr_search_candidates",
  "hunter_domain_search",
  "hunter_email_finder",
  "hunter_email_verifier",
  "apollo_search_people",
  "apollo_enrich_person",
  "apollo_search_organizations",
  "brightdata_scrape_linkedin_profiles",
  "brightdata_scrape_linkedin_companies",
  "brightdata_get_snapshot",
  "contactout_people_search",
  "contactout_linkedin_enrich",
  "contactout_person_enrich",
  "contactout_email_verify",
  "greenhouse_list_jobs",
  "greenhouse_list_candidates",
  "greenhouse_search_candidates",
  "hubspot_search_contacts",
  "hubspot_search_companies",
  "hubspot_search_deals",
  "calyflow_create_document",
] as const;
