import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFORT,
  EFFORT_LEVELS,
  effortGuidance,
  effortMaxSteps,
  effortModelTuning,
  parseEffort,
} from "@/lib/effort";

describe("parseEffort", () => {
  it("accepts the three valid levels", () => {
    expect(parseEffort("low")).toBe("low");
    expect(parseEffort("medium")).toBe("medium");
    expect(parseEffort("high")).toBe("high");
  });

  it("falls back to the default for anything else", () => {
    for (const bad of [undefined, null, "", "huge", 3, {}, "LOW"]) {
      expect(parseEffort(bad)).toBe(DEFAULT_EFFORT);
    }
  });
});

describe("effortMaxSteps", () => {
  it("keeps the agent's own budget at medium", () => {
    expect(effortMaxSteps(16, "medium")).toBe(16);
  });

  it("lowers the budget for low and raises it for high", () => {
    expect(effortMaxSteps(16, "low")).toBe(8);
    expect(effortMaxSteps(16, "high")).toBe(28);
  });

  it("orders low < medium < high for the same base", () => {
    const base = 12;
    expect(effortMaxSteps(base, "low")).toBeLessThan(
      effortMaxSteps(base, "medium"),
    );
    expect(effortMaxSteps(base, "medium")).toBeLessThan(
      effortMaxSteps(base, "high"),
    );
  });

  it("floors small budgets so the agent can still act", () => {
    expect(effortMaxSteps(2, "low")).toBe(4);
    expect(effortMaxSteps(null, "low")).toBeGreaterThanOrEqual(4);
  });

  it("caps high effort to stay within the run timeout", () => {
    expect(effortMaxSteps(100, "high")).toBe(36);
  });

  it("uses a sane fallback when no base budget is set", () => {
    expect(effortMaxSteps(null, "medium")).toBe(12);
    expect(effortMaxSteps(undefined, "medium")).toBe(12);
    expect(effortMaxSteps(0, "medium")).toBe(12);
  });
});

describe("effortGuidance", () => {
  it("returns a distinct, non-empty block per level", () => {
    const blocks = EFFORT_LEVELS.map((l) => effortGuidance(l.value));
    for (const b of blocks) expect(b.length).toBeGreaterThan(0);
    expect(new Set(blocks).size).toBe(EFFORT_LEVELS.length);
  });
});

describe("effortModelTuning", () => {
  it("maps effort to OpenAI reasoning effort 1:1 for gpt-5/o-series", () => {
    for (const e of ["low", "medium", "high"] as const) {
      const t = effortModelTuning(e, "openai", "gpt-5.1");
      expect(t.providerOptions.openai).toEqual({ reasoningEffort: e });
      expect(t.maxOutputTokens).toBeUndefined();
    }
  });

  it("does NOT send reasoning effort to non-reasoning OpenAI models", () => {
    expect(effortModelTuning("high", "openai", "gpt-4o").providerOptions).toEqual({});
  });

  it("enables Anthropic thinking for medium/high (with an output floor), off for low", () => {
    const m = "claude-sonnet-4-6";
    expect(effortModelTuning("low", "anthropic", m).providerOptions).toEqual({});
    const med = effortModelTuning("medium", "anthropic", m);
    const high = effortModelTuning("high", "anthropic", m);
    const medBudget = (med.providerOptions.anthropic as { thinking: { budgetTokens: number } }).thinking.budgetTokens;
    const highBudget = (high.providerOptions.anthropic as { thinking: { budgetTokens: number } }).thinking.budgetTokens;
    expect(highBudget).toBeGreaterThan(medBudget);
    expect(med.maxOutputTokens!).toBeGreaterThan(medBudget);
    expect(high.maxOutputTokens!).toBeGreaterThan(highBudget);
  });

  it("is a no-op for providers without a reasoning lever", () => {
    const t = effortModelTuning("high", "google", "gemini-3-pro-preview");
    expect(t.providerOptions).toEqual({});
    expect(t.maxOutputTokens).toBeUndefined();
  });
});
