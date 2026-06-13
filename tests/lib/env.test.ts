import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("required vars", () => {
  it("throws with the var name when missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect(() => env.supabaseUrl).toThrow(
      "Missing required env var: SUPABASE_URL",
    );
  });

  it("treats the empty string as missing", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", "");
    expect(() => env.appEncryptionKey).toThrow(
      "Missing required env var: APP_ENCRYPTION_KEY",
    );
  });

  it("returns the value when set", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    expect(env.supabaseUrl).toBe("https://example.supabase.co");
  });
});

describe("singleWorkspace", () => {
  it("is true when SINGLE_WORKSPACE=true even with Clerk configured", () => {
    vi.stubEnv("SINGLE_WORKSPACE", "true");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(env.singleWorkspace).toBe(true);
  });

  it("is true when CLERK_SECRET_KEY is unset", () => {
    vi.stubEnv("SINGLE_WORKSPACE", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(env.singleWorkspace).toBe(true);
  });

  it("is false when Clerk is configured and the flag is off", () => {
    vi.stubEnv("SINGLE_WORKSPACE", "false");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(env.singleWorkspace).toBe(false);
  });
});

describe("adminEmails", () => {
  it("trims, lowercases, and drops empty entries", () => {
    vi.stubEnv("ADMIN_EMAILS", " A@x.com , b@Y.com ,,");
    expect(env.adminEmails).toEqual(["a@x.com", "b@y.com"]);
  });

  it("is empty when unset", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(env.adminEmails).toEqual([]);
  });
});

describe("platformProviderEnabled", () => {
  it("requires the platform API key", () => {
    vi.stubEnv("CALYFLOW_PLATFORM_API_KEY", "");
    vi.stubEnv("PLATFORM_PROVIDER_ENABLED", "true");
    expect(env.platformProviderEnabled).toBe(false);
  });

  it("is on by default when the key is present", () => {
    vi.stubEnv("CALYFLOW_PLATFORM_API_KEY", "sk-ant-x");
    vi.stubEnv("PLATFORM_PROVIDER_ENABLED", "");
    expect(env.platformProviderEnabled).toBe(true);
  });

  it("can be switched off explicitly", () => {
    vi.stubEnv("CALYFLOW_PLATFORM_API_KEY", "sk-ant-x");
    vi.stubEnv("PLATFORM_PROVIDER_ENABLED", "false");
    expect(env.platformProviderEnabled).toBe(false);
  });
});

describe("defaults", () => {
  it("falls back to anthropic as the platform provider", () => {
    vi.stubEnv("CALYFLOW_PLATFORM_PROVIDER", undefined);
    expect(env.platformProvider).toBe("anthropic");
  });

  it("defaults the one-time credit to 11 USD", () => {
    vi.stubEnv("ONE_TIME_PLATFORM_CREDIT_DEFAULT_USD", undefined);
    expect(env.oneTimePlatformCreditDefaultUsd).toBe(11);
  });

  it("parses a configured credit amount", () => {
    vi.stubEnv("ONE_TIME_PLATFORM_CREDIT_DEFAULT_USD", "25.50");
    expect(env.oneTimePlatformCreditDefaultUsd).toBe(25.5);
  });

  it("strips the trailing slash from appBaseUrl", () => {
    vi.stubEnv("APP_BASE_URL", "https://app.calyflow.com/");
    expect(env.appBaseUrl).toBe("https://app.calyflow.com");
    vi.stubEnv("APP_BASE_URL", "https://app.calyflow.com");
    expect(env.appBaseUrl).toBe("https://app.calyflow.com");
  });

  it("mockAi only on the exact string true", () => {
    vi.stubEnv("MOCK_AI", "true");
    expect(env.mockAi).toBe(true);
    vi.stubEnv("MOCK_AI", "1");
    expect(env.mockAi).toBe(false);
  });
});

describe("domain import keys", () => {
  it("exposes FIRECRAWL_API_KEY, empty when unset", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-123");
    expect(env.firecrawlApiKey).toBe("fc-123");
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(env.firecrawlApiKey).toBe("");
  });

  it("exposes HUNTER_API_KEY, empty when unset", () => {
    vi.stubEnv("HUNTER_API_KEY", "hk-123");
    expect(env.hunterApiKey).toBe("hk-123");
    vi.stubEnv("HUNTER_API_KEY", "");
    expect(env.hunterApiKey).toBe("");
  });
});
