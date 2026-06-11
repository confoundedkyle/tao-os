import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkBudgets } from "@/lib/budgets";
import { monthSpendUsd } from "@/lib/queries";
import type { Workspace } from "@/lib/types";

vi.mock("@/lib/queries", () => ({
  monthSpendUsd: vi.fn(),
}));

const monthSpendMock = vi.mocked(monthSpendUsd);

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    clerk_org_id: "org-1",
    name: "Test",
    workspace_type: null,
    trial_ends_at: null,
    one_time_platform_credit_usd: null,
    one_time_platform_credit_spent_usd: 0,
    monthly_spend_limit_usd: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  monthSpendMock.mockReset();
  monthSpendMock.mockResolvedValue(0);
});

describe("checkBudgets", () => {
  it("is unblocked with no gates configured", async () => {
    const status = await checkBudgets(workspace(), "calyflow");
    expect(status.blocked).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.warningFraction).toBeNull();
  });

  it("blocks calyflow runs when the platform credit is spent", async () => {
    const status = await checkBudgets(
      workspace({
        one_time_platform_credit_usd: 11,
        one_time_platform_credit_spent_usd: 11,
      }),
      "calyflow",
    );
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe("platform_credit");
    expect(status.message).toContain("included AI credit");
  });

  it("never applies the platform credit gate to user-key providers", async () => {
    const status = await checkBudgets(
      workspace({
        one_time_platform_credit_usd: 11,
        one_time_platform_credit_spent_usd: 999,
      }),
      "anthropic",
    );
    expect(status.blocked).toBe(false);
  });

  it("blocks any provider at the monthly spend limit", async () => {
    monthSpendMock.mockResolvedValue(50);
    const status = await checkBudgets(
      workspace({ monthly_spend_limit_usd: 50 }),
      "anthropic",
    );
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe("spend_limit");
  });

  it("warns from 80% of the closest gate", async () => {
    monthSpendMock.mockResolvedValue(45);
    const status = await checkBudgets(
      workspace({ monthly_spend_limit_usd: 50 }),
      "anthropic",
    );
    expect(status.blocked).toBe(false);
    expect(status.warningFraction).toBeCloseTo(0.9);
  });

  it("does not warn below 80%", async () => {
    monthSpendMock.mockResolvedValue(39);
    const status = await checkBudgets(
      workspace({ monthly_spend_limit_usd: 50 }),
      "anthropic",
    );
    expect(status.warningFraction).toBeNull();
  });

  it("reports the closest of multiple gates", async () => {
    monthSpendMock.mockResolvedValue(10);
    const status = await checkBudgets(
      workspace({
        one_time_platform_credit_usd: 10,
        one_time_platform_credit_spent_usd: 9, // 90%
        monthly_spend_limit_usd: 100, // 10%
      }),
      "calyflow",
    );
    expect(status.warningFraction).toBeCloseTo(0.9);
  });

  it("coerces string numerics from the workspace row", async () => {
    monthSpendMock.mockResolvedValue(0);
    const status = await checkBudgets(
      workspace({
        one_time_platform_credit_usd:
          "11.00" as unknown as number,
        one_time_platform_credit_spent_usd:
          "11.00" as unknown as number,
      }),
      "calyflow",
    );
    expect(status.blocked).toBe(true);
    expect(status.platformCreditUsd).toBe(11);
  });
});
