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
import { getUserPreferences, listDocuments } from "@/lib/queries";
import {
  parseEffort,
  effortMaxSteps,
  effortGuidance,
  effortModelTuning,
} from "@/lib/effort";
import { personalBlock } from "@/lib/agents/prompt";
import { KB_ONBOARDING_GUIDELINES } from "@/lib/kb-onboarding/guidelines";
import { buildOnboardingTools } from "@/lib/kb-onboarding/tools";
import type { AgentRunStep } from "@/lib/types";

export const maxDuration = 600;

// Onboarding turns are short and conversational: at most a search of what's
// captured plus a save or two, then the reply. A small base keeps it snappy.
const BASE_STEPS = 6;
const KB_DOC_CHAR_CAP = 4_000;

// The user message used to kick off a fresh conversation (no typed text yet).
const START_NUDGE =
  "The recruiter just opened the knowledge-base setup assistant for the first " +
  "time. Greet them briefly and begin with the first area.";

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

/** Folds the workspace's existing KB documents into a system-prompt block so
 *  the assistant knows what's already captured (and can enrich rather than
 *  duplicate) when the user resumes onboarding another day. */
async function capturedBlock(workspaceId: string): Promise<string> {
  const docs = await listDocuments(workspaceId, "workspace", workspaceId, "kb");
  const withText = docs.filter((d) => (d.extracted_text ?? "").trim());
  if (withText.length === 0) {
    return (
      "# Already captured\nThe knowledge base is empty — this is a fresh start."
    );
  }
  const body = withText
    .map((d) => {
      const text = (d.extracted_text ?? "").trim();
      const clipped =
        text.length > KB_DOC_CHAR_CAP
          ? `${text.slice(0, KB_DOC_CHAR_CAP)}…`
          : text;
      return `## ${d.filename ?? "Untitled"}\n${clipped}`;
    })
    .join("\n\n");
  return (
    "# Already captured\nThese knowledge-base documents already exist. When the " +
    "user adds to one of these areas, ENRICH the existing document (save the " +
    "complete updated version), and pick up at the first area that's missing " +
    "or thin.\n\n" +
    body
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const task = typeof body?.task === "string" ? body.task.trim() : "";
  const effort = parseEffort(body?.effort);

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const continuingId =
    typeof body?.conversationId === "string" && UUID_RE.test(body.conversationId)
      ? body.conversationId
      : null;
  const conversationId = continuingId ?? crypto.randomUUID();

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

  const { data: run, error: runInsertError } = await db()
    .from("kb_onboarding_runs")
    .insert({
      workspace_id: session.workspaceId,
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
    console.error("KB onboarding: run insert failed", runInsertError);
    return NextResponse.json({ error: "Could not start chat" }, { status: 500 });
  }
  const runId = run.id as string;

  let systemPrompt = KB_ONBOARDING_GUIDELINES;
  try {
    systemPrompt = `${systemPrompt}\n\n${await capturedBlock(session.workspaceId)}`;
  } catch (err) {
    console.warn("KB onboarding: captured-block assembly failed:", err);
  }
  try {
    const prefs = await getUserPreferences(session.workspaceId, session.userId);
    const block = personalBlock(prefs);
    if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
  } catch (err) {
    console.warn("KB onboarding: personal preferences load failed:", err);
  }
  systemPrompt = `${systemPrompt}\n\n${effortGuidance(effort)}`;

  // Rebuild the thread from prior turns (a null task = the auto-start turn).
  const priorMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (continuingId) {
    const { data: prior } = await db()
      .from("kb_onboarding_runs")
      .select("task, output_text, created_at")
      .eq("workspace_id", session.workspaceId)
      .eq("conversation_id", conversationId)
      .neq("id", runId)
      .order("created_at", { ascending: true });
    for (const turn of prior ?? []) {
      priorMessages.push({
        role: "user",
        content: (turn.task as string | null)?.trim() || START_NUDGE,
      });
      const out = (turn.output_text as string | null)?.trim();
      if (out) priorMessages.push({ role: "assistant", content: out });
    }
  }
  const messages = [
    ...priorMessages,
    { role: "user" as const, content: task || START_NUDGE },
  ];

  const savedFilenames: string[] = [];
  const tools = buildOnboardingTools(
    session.workspaceId,
    session.userId,
    savedFilenames,
  );

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
            "Welcome! (mock) I'd normally ask about your company first — but " +
            "MOCK_AI is on, so no provider was called.";
          controller.enqueue(ndjson({ type: "text", value: outputText }));
          usage = { inputTokens: 400, outputTokens: 40, cachedInputTokens: 0 };
        } else {
          const lm = await getLanguageModel(
            primary.row.provider,
            primary.apiKey,
            model,
          );
          const effectiveProvider =
            provider === "calyflow" ? env.platformProvider : provider;
          const tuning = effortModelTuning(effort, effectiveProvider, model);
          let streamError: unknown = null;
          const result = streamText({
            model: lm,
            system: systemPrompt,
            messages,
            tools,
            stopWhen: stepCountIs(effortMaxSteps(BASE_STEPS, effort)),
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
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "Chat run failed";
      }

      const succeeded = failure === null;
      if (succeeded && !outputText.trim()) {
        outputText =
          "I saved what you shared. Tell me a bit more whenever you're ready, " +
          "or come back another time to keep building your knowledge base.";
        controller.enqueue(ndjson({ type: "text", value: outputText }));
      }

      const costUsd = await computeCostUsd(provider, model, usage).catch(
        () => null,
      );

      await db()
        .from("kb_onboarding_runs")
        .update({
          status: succeeded ? "succeeded" : "failed",
          steps,
          output_text: outputText || null,
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
        ndjson({
          type: "done",
          runId,
          conversationId,
          savedFilenames,
          finishReason,
          succeeded,
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
