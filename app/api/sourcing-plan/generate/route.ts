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
import {
  CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  connectorInCategory,
  type ConnectorCategory,
} from "@/lib/connectors";
import { MODULES } from "@/lib/types";
import {
  getActiveSourcingPlan,
  getProject,
  getUserPreferences,
} from "@/lib/queries";
import { assembleContext } from "@/lib/context";
import {
  parseEffort,
  effortMaxSteps,
  effortGuidance,
  effortModelTuning,
} from "@/lib/effort";
import { buildTools, type ToolContext } from "@/lib/agents/tools";
import { finalizeWrite } from "@/lib/agents/finalize";
import {
  resolveConnectorTokens,
  resolveFirecrawlKey,
} from "@/lib/agents/connector-tokens";
import { contextBlock, personalBlock } from "@/lib/agents/prompt";
import {
  loadSourcingPlanHarness,
  HarnessNotProvisionedError,
} from "@/lib/sourcing-plan/harness";
import { saveSourcingPlan } from "@/lib/sourcing-plan/save";
import type { AgentRunStep } from "@/lib/types";

export const maxDuration = 600; // research + multi-step tool loops can run long

// Plan mode researches the landscape, so give it room to use its tools.
const PLAN_BASE_STEPS = 18;

// Tools the plan agent may use: research the web + read the knowledge base.
// It deliberately does NOT get calyflow_create_document — the platform saves
// the plan itself (one canonical sourcing_plan doc per project).
const PLAN_TOOLS = [
  "calyflow_search_documents",
  "calyflow_read_document",
  "web_search",
  "web_scrape",
];

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

// Sourcing-relevant connector categories — agents source/enrich through these.
// Email senders (a separate Outreach step) and team-comms (human community work,
// §3) are deliberately excluded: §2 proposes how the AGENTS source.
const SOURCING_CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "ats",
  "crm",
  "contacts",
  "data",
  "tool",
];

/** A status-FREE catalog of the connectors and modules Calyflow offers, grouped
 *  by category. The Sourcing Plan is the strategy — a high-quality plan that may
 *  or may not be executed — so it must NOT be tailored to which connectors happen
 *  to be toggled on right now (they get enabled/disabled ad-hoc). This block is
 *  just the menu the plan recommends from; the Sourcing Agent maps the plan onto
 *  whatever is actually connected at run time. */
function connectorCatalogBlock(): string {
  const lines: string[] = [];
  for (const category of SOURCING_CONNECTOR_CATEGORIES) {
    const names = CONNECTORS.filter(
      (c) => c.live && !c.builtin && connectorInCategory(c, category),
    ).map((c) => c.name);
    if (names.length) {
      lines.push(
        `- **${CONNECTOR_CATEGORY_LABELS[category]}:** ${names.join(", ")}`,
      );
    }
  }
  const modules = MODULES.map((m) => `- **${m.label}** — ${m.description}`).join(
    "\n",
  );
  // People-search databases (find prospects) vs the enrich-only Contacts tools.
  // Sourcing is search-only, so the plan must recommend the searchers as channels
  // and treat the rest as a separate, post-selection contact step — spell that out
  // so the model doesn't drop searchers (SignalHire, RocketReach) as "enrichers".
  const peopleSearch = CONNECTORS.filter(
    (c) => c.live && !c.builtin && c.peopleSearch,
  ).map((c) => c.name);
  const searchNote = peopleSearch.length
    ? "\n\n**People-search databases** (search to FIND prospects — recommend these " +
      "as first-class sourcing channels in §2, search-only): " +
      peopleSearch.join(", ") +
      ". Every OTHER Contacts connector is contact-enrichment only (revealing " +
      "emails/phones) — that is a separate step AFTER candidates are picked, never " +
      "a sourcing/discovery channel, so do not build the plan's search around it."
    : "";
  return (
    "# Connectors & modules Calyflow offers (your toolbox to recommend from)\n" +
    "Do NOT tailor the plan to which of these are currently connected — connectors " +
    "get enabled/disabled ad-hoc, and this plan is the STRATEGY, executed later by " +
    "the Sourcing Agent against whatever is connected then. Recommend the tools " +
    "that genuinely fit THIS role and say how you'd use each; skip the ones that " +
    "don't fit. Do not add live on/off status labels. Email senders are excluded " +
    "(outreach is a separate step).\n\n" +
    "Connectors (by category):\n" +
    lines.join("\n") +
    searchNote +
    "\n\nInternal candidate modules:\n" +
    modules
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const projectId = String(body?.projectId ?? "");
  // A revision instruction; empty = generate a fresh plan.
  const task = typeof body?.task === "string" ? body.task.trim() : "";
  const effort = parseEffort(body?.effort);

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const continuingId =
    typeof body?.conversationId === "string" && UUID_RE.test(body.conversationId)
      ? body.conversationId
      : null;
  const conversationId = continuingId ?? crypto.randomUUID();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (project.status !== "active") {
    return NextResponse.json(
      { error: "This project is archived" },
      { status: 400 },
    );
  }

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

  // The private harness (IP) is the base system prompt. Missing → clear error.
  let harness: string;
  try {
    harness = await loadSourcingPlanHarness();
  } catch (err) {
    if (err instanceof HarnessNotProvisionedError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Could not load the sourcing-plan configuration." },
      { status: 500 },
    );
  }

  const provider = env.mockAi ? "calyflow" : primary.row.provider;
  const model = env.mockAi ? "mock-model" : primary.model;

  // Open the run row up front so the trace is recorded even on failure.
  const { data: run, error: runInsertError } = await db()
    .from("sourcing_plan_runs")
    .insert({
      project_id: projectId,
      conversation_id: conversationId,
      status: "running",
      task: task || null,
      provider,
      model,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (runInsertError || !run) {
    console.error("Sourcing plan: run insert failed", runInsertError);
    return NextResponse.json({ error: "Could not start run" }, { status: 500 });
  }
  const runId = run.id as string;

  // Assemble the system prompt: harness (IP) + the connector/module catalog
  // (status-FREE — the plan is connector-agnostic strategy) + project context
  // (JD, KB, files) + recruiter details + effort guidance.
  let systemPrompt = `${harness}\n\n${connectorCatalogBlock()}`;

  try {
    const assembled = await assembleContext(session.workspaceId, project, [], "");
    const block = contextBlock(assembled);
    if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
  } catch (err) {
    console.warn("Sourcing plan: context assembly failed:", err);
  }

  try {
    const prefs = await getUserPreferences(session.workspaceId, session.userId);
    const block = personalBlock(prefs);
    if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
  } catch (err) {
    console.warn("Sourcing plan: personal preferences load failed:", err);
  }

  systemPrompt = `${systemPrompt}\n\n${effortGuidance(effort)}`;

  // Build the user message. A revision carries the current plan so the model
  // returns the full revised markdown; a fresh generation just asks for a draft.
  const currentPlan = await getActiveSourcingPlan(session.workspaceId, projectId);
  let userPrompt: string;
  if (task) {
    userPrompt =
      `Revise the sourcing plan per this instruction:\n\n${task}\n\n` +
      "Return the COMPLETE revised plan in markdown, preserving everything not " +
      "asked to change.";
    if (currentPlan?.extracted_text?.trim()) {
      userPrompt += `\n\n# Current plan\n${currentPlan.extracted_text.trim()}`;
    }
  } else {
    userPrompt =
      "Research the landscape and draft the complete sourcing plan for this " +
      "project, following your output contract exactly.";
  }

  // Thread the earlier turns of this conversation back as context.
  const priorMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (continuingId) {
    const { data: prior } = await db()
      .from("sourcing_plan_runs")
      .select("task, output_text, created_at")
      .eq("project_id", projectId)
      .eq("conversation_id", conversationId)
      .neq("id", runId)
      .order("created_at", { ascending: true });
    for (const turn of prior ?? []) {
      priorMessages.push({
        role: "user",
        content: (turn.task as string | null)?.trim() || "(generate the plan)",
      });
      const out = (turn.output_text as string | null)?.trim();
      if (out) priorMessages.push({ role: "assistant", content: out });
    }
  }
  const messages = [
    ...priorMessages,
    { role: "user" as const, content: userPrompt },
  ];

  // The plan agent is research-only (no connector tools), so all connector
  // tokens resolve to null — resolveConnectorTokens([]) gives the full shape.
  const ctx: ToolContext = {
    workspaceId: session.workspaceId,
    projectId,
    clientId: project.client.id,
    userId: session.userId,
    ...(await resolveConnectorTokens(session.workspaceId, [])),
    firecrawlKey: await resolveFirecrawlKey(session.workspaceId),
    createdDocIds: [],
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const steps: AgentRunStep[] = [];
      let outputText = "";
      let finishReason: string | undefined;
      let usage = {
        inputTokens: undefined as number | undefined,
        outputTokens: undefined as number | undefined,
        cachedInputTokens: undefined as number | undefined,
      };
      let failure: string | null = null;

      try {
        if (env.mockAi) {
          outputText =
            `# Sourcing Plan: ${project.name} (mock)\n\n` +
            "**Mock run** (MOCK_AI=true): no provider or tools were called.\n\n" +
            "## 3. What Calyflow agents CAN'T do\n- Mock entry.";
          controller.enqueue(ndjson({ type: "text", value: outputText }));
          usage = { inputTokens: 500, outputTokens: 80, cachedInputTokens: 0 };
        } else {
          const lm = await getLanguageModel(
            primary.row.provider,
            primary.apiKey,
            model,
          );
          const tools = buildTools(ctx, PLAN_TOOLS);
          const effectiveProvider =
            provider === "calyflow" ? env.platformProvider : provider;
          const tuning = effortModelTuning(effort, effectiveProvider, model);
          let streamError: unknown = null;
          const result = streamText({
            model: lm,
            system: systemPrompt,
            messages,
            tools,
            stopWhen: stepCountIs(effortMaxSteps(PLAN_BASE_STEPS, effort)),
            abortSignal: AbortSignal.timeout(540_000),
            providerOptions: tuning.providerOptions as Parameters<
              typeof streamText
            >[0]["providerOptions"],
            ...(tuning.maxOutputTokens
              ? { maxOutputTokens: tuning.maxOutputTokens }
              : {}),
            onError: ({ error }) => {
              streamError = error;
            },
          });

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              outputText += part.text;
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
          finishReason = await result.finishReason;
          const totalUsage = await result.totalUsage;
          usage = {
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            cachedInputTokens: (totalUsage as { cachedInputTokens?: number })
              .cachedInputTokens,
          };

          // If research ate the step budget before the model wrote the plan,
          // don't throw the research away — feed it back and force a tool-free
          // write so the plan still gets produced.
          if (
            !outputText.trim() &&
            (finishReason === "tool-calls" || finishReason === "length")
          ) {
            try {
              const prior = await result.response;
              const fin = await finalizeWrite({
                model: lm,
                system: systemPrompt,
                priorMessages: [...messages, ...prior.messages],
                nudge:
                  "You've gathered enough research. Now write the COMPLETE " +
                  "sourcing plan in markdown, following your output contract " +
                  "exactly. Do not call any tools — just produce the full plan.",
                onDelta: (t) =>
                  controller.enqueue(ndjson({ type: "text", value: t })),
              });
              outputText += fin.text;
              usage = {
                inputTokens:
                  (usage.inputTokens ?? 0) + (fin.usage.inputTokens ?? 0),
                outputTokens:
                  (usage.outputTokens ?? 0) + (fin.usage.outputTokens ?? 0),
                cachedInputTokens:
                  (usage.cachedInputTokens ?? 0) +
                  (fin.usage.cachedInputTokens ?? 0),
              };
            } catch (err) {
              console.warn("Sourcing plan: finalize write failed:", err);
            }
          }
        }
      } catch (error) {
        failure =
          error instanceof Error ? error.message : "Sourcing plan run failed";
      }

      const succeeded = failure === null;

      if (succeeded && !outputText.trim()) {
        outputText =
          finishReason === "tool-calls" || finishReason === "length"
            ? "I gathered a lot of research but ran out of room before writing the plan. Run me again — narrowing the request helps me wrap up faster."
            : "I wasn't able to put together a plan this time. Mind running it again, or rephrasing the request a little?";
        controller.enqueue(ndjson({ type: "text", value: outputText }));
      }

      // Save the plan as the project's single active sourcing_plan document.
      let outputDocId: string | null = null;
      if (succeeded && outputText.trim()) {
        try {
          outputDocId = await saveSourcingPlan(
            session.workspaceId,
            projectId,
            session.userId,
            outputText,
          );
        } catch (err) {
          console.error("Sourcing plan: save failed", err);
          failure = "The plan was generated but couldn't be saved.";
        }
      }

      const costUsd = await computeCostUsd(provider, model, usage).catch(
        () => null,
      );

      const finalSucceeded = failure === null;
      await db()
        .from("sourcing_plan_runs")
        .update({
          status: finalSucceeded ? "succeeded" : "failed",
          steps,
          output_text: outputText || null,
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

      if (!finalSucceeded) {
        controller.enqueue(ndjson({ type: "error", message: failure }));
      }
      controller.enqueue(
        ndjson({
          type: "done",
          runId,
          conversationId,
          outputDocId,
          succeeded: finalSucceeded,
        }),
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
