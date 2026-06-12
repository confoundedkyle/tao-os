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
import { coresignalAdapter } from "../integrations/coresignal";
import { greenhouseAdapter } from "../integrations/greenhouse";
import { hubspotAdapter } from "../integrations/hubspot";
import { hunterAdapter } from "../integrations/hunter";
import { lemlistAdapter } from "../integrations/lemlist";
import { leverAdapter } from "../integrations/lever";
import { loxoAdapter } from "../integrations/loxo";
import { lushaAdapter } from "../integrations/lusha";
import { manatalAdapter } from "../integrations/manatal";
import { pipedriveAdapter } from "../integrations/pipedrive";
import { recruiteeAdapter } from "../integrations/recruitee";
import { recruiterflowAdapter } from "../integrations/recruiterflow";
import { snovAdapter } from "../integrations/snov";
import { teamtailorAdapter } from "../integrations/teamtailor";
import { workableAdapter } from "../integrations/workable";
import { zohoCrmAdapter } from "../integrations/zoho-crm";
import { zohoRecruitAdapter } from "../integrations/zoho-recruit";
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
  coresignalToken: string | null;
  greenhouseToken: string | null;
  hubspotToken: string | null;
  hunterToken: string | null;
  lemlistToken: string | null;
  leverToken: string | null;
  loxoToken: string | null;
  lushaToken: string | null;
  manatalToken: string | null;
  pipedriveToken: string | null;
  recruiteeToken: string | null;
  recruiterflowToken: string | null;
  snovToken: string | null;
  teamtailorToken: string | null;
  workableToken: string | null;
  zohoCrmToken: string | null;
  zohoRecruitToken: string | null;
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

    coresignal_search_employees: tool({
      description:
        "Search Coresignal's public employment-data profiles by name, title, company, and/or location, and return full profiles (name, title, company, location, work history, professional email when known, LinkedIn URL) for the top matches. EVERY call costs credits (the search plus ~2 credits per returned profile) — keep limit small (default 3, max 5) and only search when other sources lack the data.",
      inputSchema: z.object({
        name: z.string().optional().describe("Person's full name."),
        title: z.string().optional().describe("Job title / headline keywords."),
        company: z.string().optional().describe("Company name (current or past)."),
        location: z.string().optional(),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Profiles to collect (max 5; each costs credits)."),
      }),
      execute: async (args) => {
        if (!ctx.coresignalToken) return { error: notConnected("Coresignal") };
        return coresignalAdapter.searchEmployees(ctx.coresignalToken, args);
      },
    }),

    coresignal_collect_employee: tool({
      description:
        "Fetch one Coresignal employee profile by Coresignal ID (from coresignal_search_employees) or LinkedIn shorthand name (the part after /in/ in a profile URL). Costs ~2 credits per call.",
      inputSchema: z.object({
        idOrShorthand: z
          .string()
          .describe("Coresignal id, or LinkedIn shorthand, e.g. janedoe."),
      }),
      execute: async ({ idOrShorthand }) => {
        if (!ctx.coresignalToken) return { error: notConnected("Coresignal") };
        return coresignalAdapter.collectEmployee(ctx.coresignalToken, idOrShorthand);
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

    loxo_list_jobs: tool({
      description:
        "List jobs in the connected Loxo ATS (title, status, company, location, job id). Optionally filter with a text query. Use to find the role you are sourcing for.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Text filter, e.g. a role title or client company."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.loxoToken) return { error: notConnected("Loxo") };
        return loxoAdapter.listJobs(ctx.loxoToken, args);
      },
    }),

    loxo_search_people: tool({
      description:
        "Search the connected Loxo people database by name, title, company, or email. Returns name, title, company, location, and email as a Markdown table.",
      inputSchema: z.object({
        query: z.string().describe("Search text, e.g. a name, title, or company."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.loxoToken) return { error: notConnected("Loxo") };
        return loxoAdapter.searchPeople(ctx.loxoToken, args);
      },
    }),

    loxo_list_job_candidates: tool({
      description:
        "List the candidates attached to a Loxo job's pipeline as a Markdown table. Get the jobId from loxo_list_jobs first.",
      inputSchema: z.object({
        jobId: z.string().describe("Job id (from loxo_list_jobs)."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.loxoToken) return { error: notConnected("Loxo") };
        return loxoAdapter.listJobCandidates(ctx.loxoToken, args);
      },
    }),

    lever_list_postings: tool({
      description:
        "List job postings in the connected Lever ATS (title, state, team, location, posting id). Filter by state, e.g. published. Use to find the role you are sourcing for.",
      inputSchema: z.object({
        state: z
          .string()
          .optional()
          .describe("Posting state filter, e.g. published, internal, closed."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.leverToken) return { error: notConnected("Lever") };
        return leverAdapter.listPostings(ctx.leverToken, args);
      },
    }),

    lever_list_opportunities: tool({
      description:
        "List candidates (opportunities) in the connected Lever ATS as a Markdown table (name, headline, email, phone, stage). Filters combine: postingId scopes to one role's pipeline, email finds a specific person.",
      inputSchema: z.object({
        postingId: z
          .string()
          .optional()
          .describe("Posting id (from lever_list_postings) to scope to one role."),
        email: z.string().optional().describe("Find a candidate by email."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.leverToken) return { error: notConnected("Lever") };
        return leverAdapter.listOpportunities(ctx.leverToken, args);
      },
    }),

    lemlist_list_campaigns: tool({
      description:
        "List outreach campaigns in the connected lemlist account (name, status, errors, campaign id). Filter by status: running, draft, paused, ended, archived, errors.",
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe("Campaign status filter, e.g. running."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.lemlistToken) return { error: notConnected("lemlist") };
        return lemlistAdapter.listCampaigns(ctx.lemlistToken, args);
      },
    }),

    lemlist_list_activities: tool({
      description:
        "List recent lemlist outreach activity (emails sent/opened/clicked/replied, per lead and campaign). Filter by campaignId and/or type (e.g. emailsReplied, emailsOpened, emailsSent) to report on campaign performance.",
      inputSchema: z.object({
        campaignId: z
          .string()
          .optional()
          .describe("Campaign id (from lemlist_list_campaigns)."),
        type: z
          .string()
          .optional()
          .describe("Activity type, e.g. emailsReplied, emailsOpened, emailsSent."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.lemlistToken) return { error: notConnected("lemlist") };
        return lemlistAdapter.listActivities(ctx.lemlistToken, args);
      },
    }),

    lemlist_add_lead: tool({
      description:
        "Add a lead to a lemlist outreach campaign. CAUTION: if the campaign is running, lemlist will start sending real outreach emails to this person — only add leads the user explicitly asked to enroll, and never enroll in bulk without instruction. Deduplicates by email across campaigns by default. Provide firstName/lastName/companyName so the sequence's personalisation variables resolve.",
      inputSchema: z.object({
        campaignId: z
          .string()
          .describe("Target campaign id (from lemlist_list_campaigns)."),
        email: z.string().describe("The lead's email address."),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        companyName: z.string().optional(),
        jobTitle: z.string().optional(),
        linkedinUrl: z.string().optional(),
        companyDomain: z.string().optional(),
        icebreaker: z
          .string()
          .optional()
          .describe("Personalised opening line, if the sequence uses one."),
        deduplicate: z
          .boolean()
          .optional()
          .describe("Skip if the email already exists in any campaign (default true)."),
      }),
      execute: async (args) => {
        if (!ctx.lemlistToken) return { error: notConnected("lemlist") };
        return lemlistAdapter.addLead(ctx.lemlistToken, args);
      },
    }),

    manatal_list_jobs: tool({
      description:
        "List jobs in the connected Manatal ATS (position, status, location, job id). Filter by positionName and/or status. Use to find the role you are sourcing for.",
      inputSchema: z.object({
        positionName: z
          .string()
          .optional()
          .describe("Filter by position name."),
        status: z.string().optional().describe("Filter by job status."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.manatalToken) return { error: notConnected("Manatal") };
        return manatalAdapter.listJobs(ctx.manatalToken, args);
      },
    }),

    manatal_search_candidates: tool({
      description:
        "Search candidates in the connected Manatal ATS by name, email, current company, or current position (the list endpoint is the search — filters combine). Omit all filters to list recent candidates.",
      inputSchema: z.object({
        fullName: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional().describe("Current company filter."),
        position: z.string().optional().describe("Current position/title filter."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.manatalToken) return { error: notConnected("Manatal") };
        return manatalAdapter.searchCandidates(ctx.manatalToken, args);
      },
    }),

    manatal_list_job_candidates: tool({
      description:
        "List a Manatal job's pipeline (matches) with each candidate's details and stage as a Markdown table. Get the jobId from manatal_list_jobs first. Max 25 candidates per call.",
      inputSchema: z.object({
        jobId: z.string().describe("Job id (from manatal_list_jobs)."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.manatalToken) return { error: notConnected("Manatal") };
        return manatalAdapter.listJobCandidates(ctx.manatalToken, args);
      },
    }),

    lusha_search_person: tool({
      description:
        "Look up a person in Lusha's B2B contact database — by LinkedIn URL, email, or firstName+lastName plus companyName/companyDomain. Returns a free preview: who matched, which data points exist, what each reveal costs in credits, and the contact id. Does NOT reveal emails/phones — use lusha_enrich_contacts with the contact id for that.",
      inputSchema: z.object({
        linkedinUrl: z.string().optional().describe("LinkedIn profile URL (preferred)."),
        email: z.string().optional().describe("A known email of theirs."),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        companyName: z.string().optional(),
        companyDomain: z.string().optional().describe("e.g. acme.com."),
      }),
      execute: async (args) => {
        if (!ctx.lushaToken) return { error: notConnected("Lusha") };
        return lushaAdapter.searchPerson(ctx.lushaToken, args);
      },
    }),

    lusha_enrich_contacts: tool({
      description:
        "Reveal emails and phone numbers for Lusha contacts found via lusha_search_person. COSTS credits per revealed data point (the search preview shows the price) — only enrich people you actually intend to contact, max 10 ids per call.",
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .describe("Contact ids from lusha_search_person results."),
        reveal: z
          .array(z.enum(["emails", "phones"]))
          .optional()
          .describe("Data points to reveal (defaults to both)."),
      }),
      execute: async (args) => {
        if (!ctx.lushaToken) return { error: notConnected("Lusha") };
        return lushaAdapter.enrichContacts(ctx.lushaToken, args);
      },
    }),

    pipedrive_search_persons: tool({
      description:
        "Search persons in the connected Pipedrive CRM by name, email, or phone (term must be 2+ characters). Returns name, email, phone, and organization.",
      inputSchema: z.object({
        term: z.string().describe("Search term, e.g. a name or email."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.pipedriveToken) return { error: notConnected("Pipedrive") };
        return pipedriveAdapter.searchPersons(ctx.pipedriveToken, args);
      },
    }),

    pipedrive_search_organizations: tool({
      description:
        "Search organizations in the connected Pipedrive CRM by name (term must be 2+ characters). Returns organization name and address.",
      inputSchema: z.object({
        term: z.string().describe("Search term, e.g. a company name."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.pipedriveToken) return { error: notConnected("Pipedrive") };
        return pipedriveAdapter.searchOrganizations(ctx.pipedriveToken, args);
      },
    }),

    pipedrive_search_deals: tool({
      description:
        "Search deals in the connected Pipedrive CRM by title (term must be 2+ characters). Returns deal title, value, status, and the linked organization/person.",
      inputSchema: z.object({
        term: z.string().describe("Search term, e.g. a deal or client name."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.pipedriveToken) return { error: notConnected("Pipedrive") };
        return pipedriveAdapter.searchDeals(ctx.pipedriveToken, args);
      },
    }),

    recruitee_list_offers: tool({
      description:
        "List jobs (offers) in the connected Recruitee ATS (title, status, department, location, offer id). Use to find the role you are sourcing for.",
      inputSchema: z.object({
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.recruiteeToken) return { error: notConnected("Recruitee") };
        return recruiteeAdapter.listOffers(ctx.recruiteeToken, args);
      },
    }),

    recruitee_list_candidates: tool({
      description:
        "List candidates in the connected Recruitee ATS as a Markdown table (name, email, phone, positions). Filters combine: query searches by name/email, offerId scopes to one job's pipeline (from recruitee_list_offers).",
      inputSchema: z.object({
        query: z.string().optional().describe("Search by name or email."),
        offerId: z
          .string()
          .optional()
          .describe("Offer id to scope to one job's pipeline."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.recruiteeToken) return { error: notConnected("Recruitee") };
        return recruiteeAdapter.listCandidates(ctx.recruiteeToken, args);
      },
    }),

    recruiterflow_list_jobs: tool({
      description:
        "List jobs in the connected Recruiterflow ATS (name, status, client company, location, job id). Set openOnly for live roles; paginate with page.",
      inputSchema: z.object({
        openOnly: z.boolean().optional().describe("Only open jobs."),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.recruiterflowToken)
          return { error: notConnected("Recruiterflow") };
        return recruiterflowAdapter.listJobs(ctx.recruiterflowToken, args);
      },
    }),

    recruiterflow_list_candidates: tool({
      description:
        "List candidates in the connected Recruiterflow ATS as a Markdown table (name, email, phone, title, company). No server-side search — paginate with page and scan; be economical.",
      inputSchema: z.object({
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.recruiterflowToken)
          return { error: notConnected("Recruiterflow") };
        return recruiterflowAdapter.listCandidates(ctx.recruiterflowToken, args);
      },
    }),

    snov_find_email: tool({
      description:
        "Find a person's work email via Snov.io from their first name, last name, and company domain. Costs a credit. May return a pending task — finish it with snov_get_task_result.",
      inputSchema: z.object({
        firstName: z.string().describe("First name."),
        lastName: z.string().describe("Last name."),
        domain: z.string().describe("Company domain, e.g. acme.com."),
      }),
      execute: async (args) => {
        if (!ctx.snovToken) return { error: notConnected("Snov.io") };
        return snovAdapter.findEmail(ctx.snovToken, args);
      },
    }),

    snov_verify_email: tool({
      description:
        "Verify one email's deliverability via Snov.io (SMTP status, disposability). May return a pending task — finish it with snov_get_task_result.",
      inputSchema: z.object({
        email: z.string().describe("The email address to verify."),
      }),
      execute: async (args) => {
        if (!ctx.snovToken) return { error: notConnected("Snov.io") };
        return snovAdapter.verifyEmail(ctx.snovToken, args);
      },
    }),

    snov_get_task_result: tool({
      description:
        "Fetch the finished result of a pending Snov.io finder or verifier task (use the task hash the starting tool returned). Free to call.",
      inputSchema: z.object({
        type: z.enum(["finder", "verifier"]).describe("Which task type."),
        taskHash: z.string().describe("Task hash from the starting tool."),
      }),
      execute: async (args) => {
        if (!ctx.snovToken) return { error: notConnected("Snov.io") };
        return snovAdapter.getTaskResult(ctx.snovToken, args);
      },
    }),

    snov_get_profile: tool({
      description:
        "Look up the public profile behind an email via Snov.io (name, current position, social links). Useful to qualify an address before outreach.",
      inputSchema: z.object({
        email: z.string().describe("The email address to profile."),
      }),
      execute: async (args) => {
        if (!ctx.snovToken) return { error: notConnected("Snov.io") };
        return snovAdapter.getProfileByEmail(ctx.snovToken, args);
      },
    }),

    teamtailor_list_jobs: tool({
      description:
        "List jobs in the connected Teamtailor ATS (title, status, remote status, job id). Filter by status: published, draft, archived, scheduled, internal.",
      inputSchema: z.object({
        status: z.string().optional().describe("Job status filter."),
        limit: z.number().int().positive().optional().describe("Max 30."),
      }),
      execute: async (args) => {
        if (!ctx.teamtailorToken) return { error: notConnected("Teamtailor") };
        return teamtailorAdapter.listJobs(ctx.teamtailorToken, args);
      },
    }),

    teamtailor_list_candidates: tool({
      description:
        "List candidates in the connected Teamtailor ATS as a Markdown table (name, email, phone, pitch). Pass email to find a specific person; omit filters to list recent candidates.",
      inputSchema: z.object({
        email: z.string().optional().describe("Find a candidate by email."),
        limit: z.number().int().positive().optional().describe("Max 30."),
      }),
      execute: async (args) => {
        if (!ctx.teamtailorToken) return { error: notConnected("Teamtailor") };
        return teamtailorAdapter.listCandidates(ctx.teamtailorToken, args);
      },
    }),

    teamtailor_list_job_candidates: tool({
      description:
        "List the candidates who applied to a Teamtailor job as a Markdown table. Get the jobId from teamtailor_list_jobs first.",
      inputSchema: z.object({
        jobId: z.string().describe("Job id (from teamtailor_list_jobs)."),
        limit: z.number().int().positive().optional().describe("Max 30."),
      }),
      execute: async (args) => {
        if (!ctx.teamtailorToken) return { error: notConnected("Teamtailor") };
        return teamtailorAdapter.listJobApplications(ctx.teamtailorToken, args);
      },
    }),

    workable_list_jobs: tool({
      description:
        "List jobs in the connected Workable ATS (title, state, department, location, shortcode). Filter by state: draft, published, closed, archived. Use to find the role you are sourcing for — the shortcode scopes candidate lookups.",
      inputSchema: z.object({
        state: z
          .string()
          .optional()
          .describe("Job state filter: draft, published, closed, archived."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.workableToken) return { error: notConnected("Workable") };
        return workableAdapter.listJobs(ctx.workableToken, args);
      },
    }),

    workable_list_candidates: tool({
      description:
        "List candidates in the connected Workable ATS as a Markdown table (name, email, phone, headline, stage, job). Filters combine: shortcode (a job's pipeline, from workable_list_jobs), stage, and email (find a specific person).",
      inputSchema: z.object({
        shortcode: z
          .string()
          .optional()
          .describe("Job shortcode to scope to one role's pipeline."),
        stage: z.string().optional().describe("Stage slug filter."),
        email: z.string().optional().describe("Find a candidate by email."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.workableToken) return { error: notConnected("Workable") };
        return workableAdapter.listCandidates(ctx.workableToken, args);
      },
    }),

    zohocrm_search_contacts: tool({
      description:
        "Search contacts in the connected Zoho CRM by name, email, or other text (2+ characters). Returns name, email, phone, account, and title.",
      inputSchema: z.object({
        word: z.string().describe("Search text, e.g. a name or email."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.zohoCrmToken) return { error: notConnected("Zoho CRM") };
        return zohoCrmAdapter.searchContacts(ctx.zohoCrmToken, args);
      },
    }),

    zohocrm_search_accounts: tool({
      description:
        "Search accounts (companies) in the connected Zoho CRM by name (2+ characters). Returns account name, website, industry, and location.",
      inputSchema: z.object({
        word: z.string().describe("Search text, e.g. a company name."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.zohoCrmToken) return { error: notConnected("Zoho CRM") };
        return zohoCrmAdapter.searchAccounts(ctx.zohoCrmToken, args);
      },
    }),

    zohocrm_search_deals: tool({
      description:
        "Search deals in the connected Zoho CRM by name (2+ characters). Returns deal name, amount, stage, account, and closing date.",
      inputSchema: z.object({
        word: z.string().describe("Search text, e.g. a deal or client name."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.zohoCrmToken) return { error: notConnected("Zoho CRM") };
        return zohoCrmAdapter.searchDeals(ctx.zohoCrmToken, args);
      },
    }),

    zohorecruit_search_candidates: tool({
      description:
        "Search candidates in the connected Zoho Recruit ATS by name, email, or skill text (2+ characters). Returns name, email, phone, title, and city.",
      inputSchema: z.object({
        word: z.string().describe("Search text, e.g. a name, email, or skill."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.zohoRecruitToken)
          return { error: notConnected("Zoho Recruit") };
        return zohoRecruitAdapter.searchCandidates(ctx.zohoRecruitToken, args);
      },
    }),

    zohorecruit_search_job_openings: tool({
      description:
        "Search job openings in the connected Zoho Recruit ATS by title or client text (2+ characters). Returns posting title, client, status, city, and openings count.",
      inputSchema: z.object({
        word: z.string().describe("Search text, e.g. a role title or client."),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        if (!ctx.zohoRecruitToken)
          return { error: notConnected("Zoho Recruit") };
        return zohoRecruitAdapter.searchJobOpenings(ctx.zohoRecruitToken, args);
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
  "coresignal_search_employees",
  "coresignal_collect_employee",
  "greenhouse_list_jobs",
  "greenhouse_list_candidates",
  "greenhouse_search_candidates",
  "hubspot_search_contacts",
  "hubspot_search_companies",
  "hubspot_search_deals",
  "lever_list_postings",
  "lever_list_opportunities",
  "lemlist_list_campaigns",
  "lemlist_list_activities",
  "lemlist_add_lead",
  "loxo_list_jobs",
  "loxo_search_people",
  "loxo_list_job_candidates",
  "lusha_search_person",
  "lusha_enrich_contacts",
  "manatal_list_jobs",
  "manatal_search_candidates",
  "manatal_list_job_candidates",
  "pipedrive_search_persons",
  "pipedrive_search_organizations",
  "pipedrive_search_deals",
  "recruitee_list_offers",
  "recruitee_list_candidates",
  "recruiterflow_list_jobs",
  "recruiterflow_list_candidates",
  "snov_find_email",
  "snov_verify_email",
  "snov_get_task_result",
  "snov_get_profile",
  "teamtailor_list_jobs",
  "teamtailor_list_candidates",
  "teamtailor_list_job_candidates",
  "workable_list_jobs",
  "workable_list_candidates",
  "zohocrm_search_contacts",
  "zohocrm_search_accounts",
  "zohocrm_search_deals",
  "zohorecruit_search_candidates",
  "zohorecruit_search_job_openings",
  "calyflow_create_document",
] as const;
