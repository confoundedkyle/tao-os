import "server-only";
import { generateText, type LanguageModel } from "ai";
import { db } from "./db";
import { decrypt } from "./crypto";
import { env } from "./env";
import type { AiProvider } from "./types";

export const SUPPORTED_PROVIDERS = [
  "calyflow",
  "anthropic",
  "openai",
  "google",
] as const;

export function providerLabel(provider: string): string {
  switch (provider) {
    case "calyflow":
      return "Calyflow default";
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    default:
      return provider;
  }
}

export async function getLanguageModel(
  provider: string,
  apiKey: string,
  modelId: string,
): Promise<LanguageModel> {
  switch (provider) {
    case "calyflow":
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey })(modelId);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/** Cheap ping used to validate a key on save (SPEC §10). */
export async function validateApiKey(
  provider: string,
  apiKey: string,
  modelId: string,
): Promise<{ valid: boolean; message?: string }> {
  try {
    const model = await getLanguageModel(provider, apiKey, modelId);
    await generateText({ model, prompt: "ping", maxOutputTokens: 1 });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

export interface ResolvedProvider {
  row: AiProvider;
  apiKey: string;
  model: string;
}

/**
 * Providers for a run, in priority order, with decrypted keys.
 * 'calyflow' resolves to the platform key — uniform, no special-casing.
 */
export async function resolveRunProviders(
  workspaceId: string,
): Promise<ResolvedProvider[]> {
  const { data, error } = await db()
    .from("workspace_ai_providers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority");
  if (error) throw error;

  const resolved: ResolvedProvider[] = [];
  for (const row of (data ?? []) as AiProvider[]) {
    if (row.provider === "calyflow") {
      if (!env.platformProviderEnabled) continue;
      resolved.push({
        row,
        apiKey: env.platformApiKey,
        model: row.default_model || env.platformModel,
      });
    } else {
      if (!row.api_key_cipher || !row.default_model) continue;
      resolved.push({
        row,
        apiKey: decrypt(row.api_key_cipher),
        model: row.default_model,
      });
    }
  }
  return resolved;
}

interface Pricing {
  input?: number; // USD per 1M input tokens
  output?: number; // USD per 1M output tokens
  cache_read?: number; // USD per 1M cached input tokens
}

/**
 * Cost snapshotted at run time from model_catalog pricing (SPEC §4).
 * models.dev prices are USD per million tokens.
 */
export async function computeCostUsd(
  provider: string,
  modelId: string,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  },
): Promise<number | null> {
  const catalogProvider = provider === "calyflow" ? "anthropic" : provider;
  const { data } = await db()
    .from("model_catalog")
    .select("pricing")
    .eq("provider", catalogProvider)
    .eq("model_id", modelId)
    .maybeSingle();
  const pricing = data?.pricing as Pricing | null;
  if (!pricing?.input || !pricing?.output) return null;

  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max((usage.inputTokens ?? 0) - cached, 0);
  const cost =
    (uncachedInput * pricing.input +
      (usage.outputTokens ?? 0) * pricing.output +
      cached * (pricing.cache_read ?? pricing.input)) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
