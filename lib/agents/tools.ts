import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "../db";
import { listDocuments, getDocument } from "../queries";
import { airtableAdapter } from "../integrations/airtable";
import { ashbyAdapter } from "../integrations/ashby";
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
  ashbyToken: string | null;
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
  "calyflow_create_document",
] as const;
