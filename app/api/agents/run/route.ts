import { NextRequest, NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { checkBudgets } from "@/lib/budgets";
import {
  computeCostUsd,
  getLanguageModel,
  resolveRunProviders,
} from "@/lib/providers";
import { getConnection, getProject, getWorkspaceAgent } from "@/lib/queries";
import { getValidAccessToken } from "@/lib/integrations";
import { assembleContext, type AssembledContext } from "@/lib/context";
import { buildTools, type ToolContext } from "@/lib/agents/tools";
import type { AgentRunStep } from "@/lib/types";

export const maxDuration = 600; // multi-step tool loops can run long

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

/** Folds assembled project/KB context into a system-prompt block so the agent
 *  starts with full context (the JD, scorecards, notes) instead of having to
 *  guess search terms. The read tools remain for anything not included here
 *  (e.g. CVs, or docs trimmed by the per-scope caps). */
function contextBlock(c: AssembledContext): string {
  const sections: [string, string][] = [
    ["Workspace knowledge base", c.workspaceKb],
    ["Client knowledge base", c.clientKb],
    ["Client files", c.clientFiles],
    ["Project files", c.projectFiles],
  ].filter(([, v]) => v && v.trim()) as [string, string][];
  if (sections.length === 0) return "";
  const body = sections.map(([t, v]) => `## ${t}\n${v}`).join("\n\n");
  return (
    "# Project context\nThe following documents from this project and its " +
    "knowledge base are already available — use them directly; only call the " +
    "search/read tools for anything not present here.\n\n" +
    body
  );
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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const projectId = String(body?.projectId ?? "");
  const agentId = String(body?.agentId ?? "");
  const task = typeof body?.task === "string" ? body.task : "";

  const [project, agent] = await Promise.all([
    getProject(session.workspaceId, projectId),
    getWorkspaceAgent(session.workspaceId, agentId),
  ]);
  if (!project || !agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (project.status !== "active") {
    return NextResponse.json(
      { error: "This project is archived" },
      { status: 400 },
    );
  }

  // Resolve the primary provider (no mid-loop fallback for agent runs).
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

  const allowed: string[] = Array.isArray(agent.allowed_tools)
    ? agent.allowed_tools
    : [];

  // Resolve a valid token for each connector the agent uses, up front
  // (refreshing if needed). A configured-but-broken connection fails the run
  // early with a clear reconnect message; a not-yet-connected one stays null so
  // its tools report "not connected" rather than failing the whole run.
  const tokenFor = async (
    prefix: string,
    provider: string,
  ): Promise<string | null> => {
    if (!allowed.some((t) => t.startsWith(prefix))) return null;
    const connection = await getConnection(session.workspaceId, provider);
    if (!connection) return null;
    return getValidAccessToken(connection);
  };
  let airtableToken: string | null = null;
  let apolloToken: string | null = null;
  let ashbyToken: string | null = null;
  let breezyhrToken: string | null = null;
  let brightdataToken: string | null = null;
  let contactoutToken: string | null = null;
  let greenhouseToken: string | null = null;
  let hubspotToken: string | null = null;
  let hunterToken: string | null = null;
  let lemlistToken: string | null = null;
  let loxoToken: string | null = null;
  let lushaToken: string | null = null;
  try {
    [
      airtableToken,
      apolloToken,
      ashbyToken,
      breezyhrToken,
      brightdataToken,
      contactoutToken,
      greenhouseToken,
      hubspotToken,
      hunterToken,
      lemlistToken,
      loxoToken,
      lushaToken,
    ] = await Promise.all([
      tokenFor("airtable_", "airtable"),
      tokenFor("apollo_", "apollo"),
      tokenFor("ashby_", "ashby"),
      tokenFor("breezyhr_", "breezyhr"),
      tokenFor("brightdata_", "brightdata"),
      tokenFor("contactout_", "contactout"),
      tokenFor("greenhouse_", "greenhouse"),
      tokenFor("hubspot_", "hubspot"),
      tokenFor("hunter_", "hunter"),
      tokenFor("lemlist_", "lemlist"),
      tokenFor("loxo_", "loxo"),
      tokenFor("lusha_", "lusha"),
    ]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection error" },
      { status: 400 },
    );
  }

  const provider = env.mockAi ? "calyflow" : primary.row.provider;
  const model = env.mockAi
    ? "mock-model"
    : agent.model || primary.model;

  // Open the run row up front so the trace is recorded even on failure.
  const { data: run, error: runInsertError } = await db()
    .from("agent_runs")
    .insert({
      project_id: projectId,
      workspace_agent_id: agentId,
      status: "running",
      task: task.trim() || null,
      provider,
      model,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (runInsertError || !run) {
    return NextResponse.json({ error: "Could not start run" }, { status: 500 });
  }
  const runId = run.id as string;

  const ctx: ToolContext = {
    workspaceId: session.workspaceId,
    projectId,
    clientId: project.client.id,
    userId: session.userId,
    airtableToken,
    apolloToken,
    ashbyToken,
    breezyhrToken,
    brightdataToken,
    contactoutToken,
    greenhouseToken,
    hubspotToken,
    hunterToken,
    lemlistToken,
    loxoToken,
    lushaToken,
    createdDocIds: [],
  };

  const userPrompt = task.trim()
    ? task.trim()
    : "Carry out your standard task for this project.";

  // Pre-load project + KB context (the JD, scorecards, notes) into the system
  // prompt so the agent has full context up front — same assembly the workflow
  // runs use. Failure here must not abort the run; the read tools still work.
  let systemPrompt = agent.instructions;
  try {
    const assembled = await assembleContext(
      session.workspaceId,
      project,
      [],
      "",
    );
    const block = contextBlock(assembled);
    if (block) systemPrompt = `${agent.instructions}\n\n${block}`;
  } catch (err) {
    console.warn("Agent context assembly failed:", err);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const steps: AgentRunStep[] = [];
      let usage = {
        inputTokens: undefined as number | undefined,
        outputTokens: undefined as number | undefined,
        cachedInputTokens: undefined as number | undefined,
      };
      let failure: string | null = null;

      try {
        if (env.mockAi) {
          const text =
            "**Mock agent run** (MOCK_AI=true): no provider or tools were called.";
          controller.enqueue(ndjson({ type: "text", value: text }));
          usage = { inputTokens: 500, outputTokens: 60, cachedInputTokens: 0 };
        } else {
          const lm = await getLanguageModel(
            primary.row.provider,
            primary.apiKey,
            model,
          );
          const tools = buildTools(ctx, allowed);
          let streamError: unknown = null;
          const result = streamText({
            model: lm,
            system: systemPrompt,
            prompt: userPrompt,
            tools,
            stopWhen: stepCountIs(agent.max_steps ?? 12),
            abortSignal: AbortSignal.timeout(540_000),
            onError: ({ error }) => {
              streamError = error;
            },
          });

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(ndjson({ type: "text", value: part.text }));
            } else if (part.type === "tool-call") {
              steps.push({
                type: "tool-call",
                tool: part.toolName,
                summary: summarize(part.input),
              });
              controller.enqueue(
                ndjson({
                  type: "tool-call",
                  tool: part.toolName,
                  summary: summarize(part.input),
                }),
              );
            } else if (part.type === "tool-result") {
              steps.push({
                type: "tool-result",
                tool: part.toolName,
                summary: summarize(part.output),
              });
              controller.enqueue(
                ndjson({
                  type: "tool-result",
                  tool: part.toolName,
                  summary: summarize(part.output),
                }),
              );
            } else if (part.type === "tool-error") {
              steps.push({
                type: "tool-error",
                tool: part.toolName,
                summary: summarize(part.error),
              });
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
            cachedInputTokens: (
              totalUsage as { cachedInputTokens?: number }
            ).cachedInputTokens,
          };
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "Agent run failed";
      }

      const succeeded = failure === null;
      const outputDocId = ctx.createdDocIds.at(-1) ?? null;
      const costUsd = await computeCostUsd(provider, model, usage).catch(
        () => null,
      );

      await db()
        .from("agent_runs")
        .update({
          status: succeeded ? "succeeded" : "failed",
          steps,
          output_doc_id: outputDocId,
          error_message: failure ? failure.slice(0, 500) : null,
          input_tokens: usage.inputTokens ?? null,
          output_tokens: usage.outputTokens ?? null,
          cache_read_tokens: usage.cachedInputTokens ?? null,
          cost_usd: costUsd,
        })
        .eq("id", runId);

      if (provider === "calyflow" && costUsd) {
        await db().rpc("increment_platform_spent", {
          p_workspace_id: session.workspaceId,
          p_amount: costUsd,
        });
      }

      if (!succeeded) {
        controller.enqueue(ndjson({ type: "error", message: failure }));
      }
      controller.enqueue(
        ndjson({ type: "done", runId, outputDocId, succeeded }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Run-Id": runId,
    },
  });
}
