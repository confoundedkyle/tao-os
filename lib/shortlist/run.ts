import "server-only";
import {
  generateText,
  stepCountIs,
  type ModelMessage,
  type StopCondition,
  type ToolSet,
} from "ai";
import { db } from "../db";
import { env } from "../env";
import { computeCostUsd, getLanguageModel } from "../providers";
import { connectorLabel, effectiveConnectorCaps } from "../connectors";
import {
  getActiveSourcingPlan,
  getUserPreferences,
  listConnections,
} from "../queries";
import { connectedProvidersFrom } from "../run-items";
import { assembleContext } from "../context";
import { contextBlock, personalBlock } from "../agents/prompt";
import {
  buildTools,
  SOURCING_AGENT_TOOLS,
  type ToolContext,
} from "../agents/tools";
import {
  resolveConnectorTokens,
  resolveFirecrawlKey,
} from "../agents/connector-tokens";
import {
  countQualified,
  listCandidatesCompact,
  listCandidateFeedback,
} from "../candidates/queries";
import { formatFeedbackBlock } from "../candidates/feedback";
import {
  connectorSpendByProvider,
  recordConnectorCreditUsage,
} from "./spend";
import { appendProgressEntry } from "../sourcing-plan/progress";
import type { AgentRunStep, Client, Project, Workspace } from "../types";

// A single Continue/Start sourcing run can chase the goal across many tool
// calls, so give it generous headroom; the goal and budget gates stop it sooner.
const STEP_CAP = 80;

export interface ShortlistRunParams {
  workspace: Workspace;
  project: Project & { client: Client };
  userId: string;
  runId: string;
  provider: string;
  model: string;
  apiKey: string | null;
  goalQualified: number | null;
  budgetUsd: number | null;
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

function connectorsBlock(providers: string[]): string {
  if (providers.length === 0) {
    return (
      "# Active connectors\nThis workspace has no data-source connectors " +
      "connected. Use the no-connector tools you have (web search/scrape, GitHub, " +
      "and any platform-keyed sources) and call out where connecting a sourcing " +
      "tool would unlock more reach."
    );
  }
  const lines = providers.map((p) => `- ${connectorLabel(p)}`).join("\n");
  return (
    "# Active connectors\nPrioritise these connected data sources you can " +
    "actually query:\n" +
    lines
  );
}

/** A status block so a resumed run continues toward the goal instead of starting
 *  over: how many candidates exist, how many qualified vs the goal, spend so far. */
function statusBlock(
  totalCandidates: number,
  qualified: number,
  goal: number | null,
  spentUsd: number,
  budgetUsd: number | null,
): string {
  const lines = [
    `- Candidates already in the shortlist: ${totalCandidates}`,
    `- Qualified so far: ${qualified}${goal ? ` (goal: ${goal})` : ""}`,
  ];
  if (budgetUsd != null) {
    lines.push(
      `- Budget spent: $${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)}`,
    );
  }
  return (
    "# Shortlist status\nContinue from where the last run left off — do NOT " +
    "re-source people already saved (use calyflow_list_candidates to check). " +
    "Keep sourcing and scoring until the qualified goal is met.\n" +
    lines.join("\n")
  );
}

/** Sum of cost_usd across this project's prior shortlist runs (budget tracking). */
async function priorSpendUsd(projectId: string): Promise<number> {
  const { data } = await db()
    .from("shortlist_runs")
    .select("cost_usd")
    .eq("project_id", projectId);
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { cost_usd: number | null }).cost_usd ?? 0),
    0,
  );
}

/**
 * Run the main Sourcing Agent headlessly toward the project's goal/budget. Built
 * to run inside `after()`: it owns the full lifecycle of an already-created
 * `shortlist_runs` row (status running → succeeded/failed), updating its step
 * trace live for the UI to poll, and appends a one-line progress entry to the
 * Sourcing Plan when done.
 */
export async function runShortlistSourcing(
  params: ShortlistRunParams,
): Promise<void> {
  const { workspace, project, userId, runId, provider, model, goalQualified } =
    params;
  const workspaceId = workspace.id;
  const projectId = project.id;

  const steps: AgentRunStep[] = [];
  let outputText = "";
  let failure: string | null = null;
  let usage = {
    inputTokens: undefined as number | undefined,
    outputTokens: undefined as number | undefined,
    cachedInputTokens: undefined as number | undefined,
  };

  // Per-connector spend caps: the effective cap (project budget or sensible
  // default) minus what's already been spent. A metered tool clamps to `remaining`.
  const priorConnectorSpend = await connectorSpendByProvider(projectId);
  const creditCaps = effectiveConnectorCaps(
    project.sourcing_connector_budgets ?? {},
    priorConnectorSpend,
  );

  const ctx: ToolContext = {
    workspaceId,
    projectId,
    clientId: project.client.id,
    userId,
    ...(await resolveConnectorTokens(workspaceId, SOURCING_AGENT_TOOLS)),
    firecrawlKey: await resolveFirecrawlKey(workspaceId),
    createdDocIds: [],
    savedCandidateIds: [],
    creditCaps,
    recordCreditUsage: (prov, credits, detail) =>
      recordConnectorCreditUsage({
        workspaceId,
        projectId,
        shortlistRunId: runId,
        provider: prov,
        credits,
        detail,
      }),
  };

  try {
    // Build the system prompt: harness + connectors + project context (auto-
    // includes the active Sourcing Plan AND Qualification criteria) + personal +
    // a live status block for resuming.
    const { loadShortlistHarness } = await import("./harness");
    let systemPrompt = await loadShortlistHarness();

    try {
      const connections = await listConnections(workspaceId);
      const providers = [...connectedProvidersFrom(connections)];
      systemPrompt = `${systemPrompt}\n\n${connectorsBlock(providers)}`;
    } catch (err) {
      console.warn("Shortlist: connectors block failed:", err);
    }

    try {
      const assembled = await assembleContext(workspaceId, project, [], "");
      const block = contextBlock(assembled);
      if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
    } catch (err) {
      console.warn("Shortlist: context assembly failed:", err);
    }

    try {
      const prefs = await getUserPreferences(workspaceId, userId);
      const block = personalBlock(prefs);
      if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
    } catch (err) {
      console.warn("Shortlist: personal preferences load failed:", err);
    }

    const [qualifiedBefore, compact, spent] = await Promise.all([
      countQualified(projectId),
      listCandidatesCompact(projectId, 1),
      priorSpendUsd(projectId),
    ]);
    systemPrompt = `${systemPrompt}\n\n${statusBlock(
      compact.length,
      qualifiedBefore,
      goalQualified,
      spent,
      params.budgetUsd,
    )}`;

    // Recruiter fit feedback from earlier reviews — calibrate to it.
    try {
      const fb = await listCandidateFeedback(projectId);
      const block = formatFeedbackBlock(fb.accepted, fb.rejected);
      if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
    } catch (err) {
      console.warn("Shortlist: feedback block failed:", err);
    }

    const userPrompt =
      "Source candidates for this project following your harness. Save each one " +
      "with calyflow_save_candidate (scored 0-100 against the qualification " +
      "criteria; partial evidence from a search snippet is enough to save). Keep " +
      "running fresh waves — new title/stack/location variants and new channels — " +
      "until the qualified goal is reached or you have genuinely exhausted the " +
      "distinct angles. Do NOT stop after one wave to say 'more waves are needed' " +
      "— run those waves now.";

    if (env.mockAi) {
      outputText = "**Mock shortlist run** (MOCK_AI=true): no tools were called.";
      usage = { inputTokens: 500, outputTokens: 60, cachedInputTokens: 0 };
    } else {
      const lm = await getLanguageModel(provider, params.apiKey ?? "", model);
      const tools = buildTools(ctx, SOURCING_AGENT_TOOLS);

      // Stop when the project hits its qualified goal (total, so resumes count
      // earlier runs). `isGoalMet` is the plain predicate the loop checks;
      // `goalReached` wraps it as a per-step StopCondition for generateText.
      const isGoalMet = async (): Promise<boolean> => {
        if (!goalQualified || goalQualified <= 0) return false;
        return (await countQualified(projectId)) >= goalQualified;
      };
      const goalReached: StopCondition<ToolSet> = () => isGoalMet();

      // The model tends to wrap up after a single "wave" even with budget and
      // steps to spare — emitting a "more waves needed" summary instead of doing
      // them. So drive it in rounds: after each call returns short of the goal,
      // carry the full conversation forward with a "keep going" nudge and run
      // another wave. Hard stops: goal met, step cap, budget spent, a round that
      // adds nobody new (genuine exhaustion), or the round ceiling.
      const MAX_ROUNDS = 6;
      // Keep the whole multi-round loop inside the 600s function budget, leaving
      // headroom for the final status/cost/progress-log writes after it.
      const deadline = Date.now() + 555_000;
      let messages: ModelMessage[] = [{ role: "user", content: userPrompt }];
      let stepsUsed = 0;
      let spentThisRun = 0;
      const agg = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (await isGoalMet()) break;
        if (stepsUsed >= STEP_CAP) break;
        if (params.budgetUsd != null && spent + spentThisRun >= params.budgetUsd)
          break;
        const remainingMs = deadline - Date.now();
        if (remainingMs < 20_000) break; // not enough time for another wave

        const savedBefore = ctx.savedCandidateIds?.length ?? 0;
        const result = await generateText({
          model: lm,
          system: systemPrompt,
          messages,
          tools,
          stopWhen: [stepCountIs(STEP_CAP - stepsUsed), goalReached],
          abortSignal: AbortSignal.timeout(Math.min(540_000, remainingMs)),
          onStepFinish: async ({ toolCalls, toolResults }) => {
            for (const call of toolCalls ?? []) {
              steps.push({
                type: "tool-call",
                tool: call.toolName,
                summary: summarize(call.input),
              });
            }
            for (const res of toolResults ?? []) {
              steps.push({
                type: "tool-result",
                tool: res.toolName,
                summary: summarize(res.output),
              });
            }
            // Persist the growing trace so the UI poll shows live progress.
            await db()
              .from("shortlist_runs")
              .update({ steps })
              .eq("id", runId)
              .then(undefined, () => {});
          },
        });

        outputText = result.text || outputText;
        stepsUsed += result.steps.length;
        const u = result.totalUsage;
        agg.inputTokens += u.inputTokens ?? 0;
        agg.outputTokens += u.outputTokens ?? 0;
        agg.cachedInputTokens +=
          (u as { cachedInputTokens?: number }).cachedInputTokens ?? 0;
        spentThisRun +=
          (await computeCostUsd(provider, model, u).catch(() => 0)) ?? 0;

        if (await isGoalMet()) break;
        const addedThisRound =
          (ctx.savedCandidateIds?.length ?? 0) - savedBefore;
        if (addedThisRound === 0) break; // re-prompting won't conjure new people

        // Progress made but goal unmet — carry the full context (tool calls and
        // all) forward and push another wave.
        messages = [
          ...messages,
          ...result.response.messages,
          {
            role: "user",
            content:
              "You have NOT reached the qualified goal yet, and you still have " +
              "budget and steps left. Do not stop. Run more waves NOW: pick " +
              "title/stack/location variants and channels you haven't tried yet " +
              "(GitHub-via-web, Stack Overflow, target-company team pages), and " +
              "keep saving every scored candidate. Don't re-source anyone already " +
              "saved. Only finish when the goal is met or the distinct angles are " +
              "genuinely exhausted.",
          },
        ];
      }

      usage = {
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        cachedInputTokens: agg.cachedInputTokens,
      };
    }
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "Shortlist sourcing run failed";
  }

  const succeeded = failure === null;
  const costUsd = await computeCostUsd(provider, model, usage).catch(() => null);
  const qualifiedAfter = await countQualified(projectId).catch(() => null);
  const candidatesAdded = ctx.savedCandidateIds?.length ?? 0;

  await db()
    .from("shortlist_runs")
    .update({
      status: succeeded ? "succeeded" : "failed",
      steps,
      output_text: outputText || null,
      error_message: failure ? failure.slice(0, 500) : null,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      cache_read_tokens: usage.cachedInputTokens ?? null,
      cost_usd: costUsd,
      candidates_added: candidatesAdded,
      qualified_after: qualifiedAfter,
    })
    .eq("id", runId);

  if (provider === "calyflow" && costUsd) {
    await db().rpc("increment_platform_spent", {
      p_workspace_id: workspaceId,
      p_amount: costUsd,
    });
  }

  // Append a one-line progress entry to the Sourcing Plan so the trail is
  // visible there too and the next run sees it.
  if (succeeded && candidatesAdded > 0) {
    try {
      const plan = await getActiveSourcingPlan(workspaceId, projectId);
      if (plan) {
        const dateLabel = new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const note =
          `Sourcing run: saved ${candidatesAdded} candidate(s), ` +
          `${qualifiedAfter ?? "?"} qualified in total` +
          (goalQualified ? ` (goal ${goalQualified})` : "") +
          ".";
        const updated = appendProgressEntry(
          plan.extracted_text ?? "",
          dateLabel,
          note,
        );
        await db()
          .from("documents")
          .update({ extracted_text: updated })
          .eq("id", plan.id);
      }
    } catch (err) {
      console.warn("Shortlist: progress-log append failed:", err);
    }
  }
}
