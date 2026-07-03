import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { streamText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { checkBudgets } from "@/lib/budgets";
import { computeCostUsd, getLanguageModel, resolveRunProviders } from "@/lib/providers";
import { getClient } from "@/lib/queries";
import { firecrawlMap, firecrawlScrape } from "@/lib/integrations/firecrawl";
import { hunterAdapter } from "@/lib/integrations/hunter";
import { hostIsWithinDomain, normalizeDomain } from "@/lib/import-domain";

export const maxDuration = 600; // multi-step scrape + synthesis can run long

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

function summarize(value: unknown): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

const IMPORT_AGENT_PROMPT = `You are a company-research agent inside TAO OS. A
recruiter wants a concise, accurate profile of the company at a given domain,
saved to their client knowledge base.

You have tools to research the site. Work autonomously over multiple steps:

1. Call \`map_site\` to discover the site's pages.
2. Scrape the most informative pages with \`scrape_page\` — always the homepage,
   then the best matches among About / Company, Products, Services / Solutions,
   Pricing, Customers, Team / Leadership, and Contact. Scrape roughly 4–6 pages;
   don't scrape every URL.
3. If \`find_contacts\` is available, pull a few key decision-makers (prefer
   executive / leadership seniority).
4. Call \`save_company_profile\` EXACTLY ONCE with a well-structured Markdown
   profile, then stop.

The profile should include, where the scraped content supports it: a one-line
summary, what the company does, its products/services, market & positioning,
size / locations / founding, and any notable facts. Add a "## Key contacts"
section ONLY if \`find_contacts\` returned people.

Rules:
- Never invent facts. Use only what the tools return; if the site is thin, say
  so plainly rather than padding.
- Write in clean Markdown with clear headings. Keep it skimmable.
- Do not output the profile as chat text — deliver it through
  \`save_company_profile\`.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { clientId } = await params;
  const client = await getClient(session.workspaceId, clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const domain = normalizeDomain(String(body?.domain ?? ""));
  if (!domain) {
    return NextResponse.json(
      { error: "Enter a valid domain, e.g. acme.com" },
      { status: 400 },
    );
  }

  if (!env.firecrawlApiKey) {
    return NextResponse.json(
      { error: "Domain import isn't configured. Set FIRECRAWL_API_KEY." },
      { status: 400 },
    );
  }
  const hunterKey = env.hunterApiKey; // optional enrichment

  // Resolve the primary provider (no mid-loop fallback, same as agent runs).
  const resolved = await resolveRunProviders(session.workspaceId);
  const primary = resolved.providers[0];
  if (!env.mockAi && !primary) {
    return NextResponse.json(
      { error: "No AI provider configured. Add one in Settings → AI Providers." },
      { status: 402 },
    );
  }
  const spendGate = await checkBudgets(session.workspace, "byo");
  if (spendGate.blocked && spendGate.reason === "spend_limit") {
    return NextResponse.json({ error: spendGate.message }, { status: 402 });
  }
  const platformGate = await checkBudgets(session.workspace, "calyflow");
  if (
    !env.mockAi &&
    primary.row.provider === "calyflow" &&
    platformGate.blocked &&
    platformGate.reason === "platform_credit"
  ) {
    return NextResponse.json({ error: platformGate.message }, { status: 402 });
  }

  const provider = env.mockAi ? "calyflow" : primary.row.provider;
  const model = env.mockAi ? "mock-model" : primary.model;

  // Tools close over server-derived context — the model never supplies the
  // domain, client, or workspace, so it can't be steered to other tenants or
  // arbitrary hosts.
  let createdDocId: string | null = null;
  const tools: ToolSet = {
    map_site: tool({
      description:
        "Discover the pages on the company's website. Returns a list of URLs (with titles where available).",
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe("Optional keyword to bias the page list, e.g. 'about'."),
      }),
      execute: async ({ search }) => {
        const { links } = await firecrawlMap(env.firecrawlApiKey, {
          domain,
          search,
        });
        return {
          count: links.length,
          links: links.slice(0, 60).map((l) => ({ url: l.url, title: l.title })),
        };
      },
    }),
    scrape_page: tool({
      description:
        "Fetch one page of the company's website as Markdown. The URL must be on the company's own domain.",
      inputSchema: z.object({
        url: z.string().describe("Absolute URL on the company's domain."),
      }),
      execute: async ({ url }) => {
        if (!hostIsWithinDomain(url, domain)) {
          return {
            error: `Refusing to scrape ${url}: only pages on ${domain} are allowed.`,
          };
        }
        const { markdown, title, truncated } = await firecrawlScrape(
          env.firecrawlApiKey,
          { url },
        );
        if (!markdown.trim()) {
          return { url, title, markdown: "", note: "No readable content." };
        }
        return { url, title, markdown, truncated };
      },
    }),
    save_company_profile: tool({
      description:
        "Save the finished company profile to the client knowledge base. Call this exactly once, at the end. Returns the new document id.",
      inputSchema: z.object({
        markdown: z.string().describe("The full company profile in Markdown."),
        title: z
          .string()
          .optional()
          .describe("Optional document title; defaults to the domain."),
      }),
      execute: async ({ markdown, title }) => {
        const filename = (title?.trim() || `Company profile – ${domain}`).replace(
          /\.md$/i,
          "",
        );
        const { data, error } = await db()
          .from("documents")
          .insert({
            scope_type: "client",
            scope_id: clientId,
            workspace_id: session.workspaceId,
            kind: "kb",
            doc_type: "note",
            source: "agent",
            filename: `${filename}.md`,
            extracted_text: markdown,
            created_by: session.userId,
          })
          .select("id")
          .single();
        if (error || !data) return { error: "Could not save the document." };
        createdDocId = data.id as string;
        return { documentId: data.id, filename: `${filename}.md` };
      },
    }),
  };

  if (hunterKey) {
    tools.find_contacts = tool({
      description:
        "Find key work contacts at the company via Hunter.io (names, roles, emails). Optional enrichment.",
      inputSchema: z.object({
        department: z
          .string()
          .optional()
          .describe("CSV of departments, e.g. 'executive,management'."),
        seniority: z
          .string()
          .optional()
          .describe("CSV of seniority levels, e.g. 'senior,executive'."),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ department, seniority, limit }) =>
        hunterAdapter.domainSearch(hunterKey, {
          domain,
          department,
          seniority,
          limit: limit ?? 10,
        }),
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage = {
        inputTokens: undefined as number | undefined,
        outputTokens: undefined as number | undefined,
        cachedInputTokens: undefined as number | undefined,
      };
      let failure: string | null = null;

      try {
        if (env.mockAi) {
          controller.enqueue(
            ndjson({
              type: "text",
              value: `**Mock import** (MOCK_AI=true): would research ${domain}.`,
            }),
          );
          usage = { inputTokens: 400, outputTokens: 50, cachedInputTokens: 0 };
        } else {
          const lm = await getLanguageModel(
            primary.row.provider,
            primary.apiKey,
            model,
          );
          let streamError: unknown = null;
          const result = streamText({
            model: lm,
            system: IMPORT_AGENT_PROMPT,
            prompt: `Research the company at ${domain} and save a company profile to the knowledge base.`,
            tools,
            stopWhen: stepCountIs(12),
            abortSignal: AbortSignal.timeout(540_000),
            onError: ({ error }) => {
              streamError = error;
            },
          });

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(ndjson({ type: "text", value: part.text }));
            } else if (part.type === "tool-call") {
              controller.enqueue(
                ndjson({
                  type: "tool-call",
                  tool: part.toolName,
                  summary: summarize(part.input),
                }),
              );
            } else if (part.type === "tool-result") {
              controller.enqueue(
                ndjson({
                  type: "tool-result",
                  tool: part.toolName,
                  summary: summarize(part.output),
                }),
              );
            } else if (part.type === "tool-error") {
              controller.enqueue(
                ndjson({
                  type: "tool-result",
                  tool: part.toolName,
                  summary: summarize(part.error),
                }),
              );
            } else if (part.type === "error") {
              streamError = part.error;
            }
          }

          if (streamError) throw streamError;
          const totalUsage = await result.totalUsage;
          usage = {
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            cachedInputTokens: (totalUsage as { cachedInputTokens?: number })
              .cachedInputTokens,
          };
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "Import failed";
      }

      const succeeded = failure === null && createdDocId !== null;

      // Keep platform credit accounting correct for calyflow-provider runs
      // (this client-scoped import has no agent_runs row to attach to).
      const costUsd = await computeCostUsd(provider, model, usage).catch(
        () => null,
      );
      if (provider === "calyflow" && costUsd) {
        try {
          await db().rpc("increment_platform_spent", {
            p_workspace_id: session.workspaceId,
            p_amount: costUsd,
          });
        } catch {
          // Non-fatal: the profile is already saved; credit accounting can lag.
        }
      }

      if (succeeded) {
        revalidatePath(`/clients/${clientId}`, "layout");
      } else if (!failure) {
        failure = "The agent finished without saving a profile. Try again.";
      }

      if (failure) {
        controller.enqueue(ndjson({ type: "error", message: failure }));
      }
      controller.enqueue(
        ndjson({ type: "done", docId: createdDocId, succeeded }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
