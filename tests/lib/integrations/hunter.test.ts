import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hunterAdapter } from "@/lib/integrations/hunter";
import { jsonResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastUrl(): URL {
  return new URL(fetchMock.mock.calls.at(-1)![0]);
}

describe("validateApiKey", () => {
  it("labels the account with the email from /account", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { email: "me@agency.com" } }),
    );
    const result = await hunterAdapter.validateApiKey!("key-1");
    expect(result).toEqual({ ok: true, accountLabel: "me@agency.com" });
    const url = lastUrl();
    expect(url.pathname).toBe("/v2/account");
    expect(url.searchParams.get("api_key")).toBe("key-1");
  });

  it("falls back to a generic label without an email", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));
    const result = await hunterAdapter.validateApiKey!("key-1");
    expect(result.accountLabel).toBe("Hunter.io account");
  });

  it("surfaces error details from the errors array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ details: "No user found", code: "401" }] }, 401),
    );
    const result = await hunterAdapter.validateApiKey!("bad");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Hunter.io error (401): No user found");
  });
});

describe("domainSearch", () => {
  it("requires a domain or company without calling the API", async () => {
    const result = await hunterAdapter.domainSearch("k", {});
    expect(result.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits empty params and clamps the limit to 100", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { emails: [] } }));
    await hunterAdapter.domainSearch("k", {
      domain: "acme.com",
      department: "",
      limit: 999,
    });
    const url = lastUrl();
    expect(url.pathname).toBe("/v2/domain-search");
    expect(url.searchParams.get("domain")).toBe("acme.com");
    expect(url.searchParams.has("department")).toBe(false);
    expect(url.searchParams.has("company")).toBe(false);
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("renders a table and reports truncation against meta.results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          emails: [
            {
              value: "ada@acme.com",
              first_name: "Ada",
              last_name: "Lovelace",
              position: "CTO",
              department: "executive",
              seniority: "executive",
              confidence: 97,
            },
          ],
        },
        meta: { results: 12 },
      }),
    );
    const result = await hunterAdapter.domainSearch("k", { domain: "acme.com" });
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain(
      "| Ada Lovelace | CTO | executive | executive | ada@acme.com | 97 |",
    );
  });
});

describe("emailFinder", () => {
  it("requires a domain or company", async () => {
    const result = await hunterAdapter.emailFinder("k", { fullName: "Ada" });
    expect(result.found).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports not found when Hunter returns no email", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { email: null } }));
    const result = await hunterAdapter.emailFinder("k", {
      domain: "acme.com",
      fullName: "Ada Lovelace",
    });
    expect(result.found).toBe(false);
  });

  it("formats a found email with confidence and position", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { email: "ada@acme.com", score: 97, position: "CTO" } }),
    );
    const result = await hunterAdapter.emailFinder("k", {
      domain: "acme.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(result.found).toBe(true);
    expect(result.text).toBe("ada@acme.com (confidence 97%, CTO)");
    const url = lastUrl();
    expect(url.searchParams.get("first_name")).toBe("Ada");
    expect(url.searchParams.get("last_name")).toBe("Lovelace");
  });
});

describe("emailVerifier", () => {
  it("formats result and score", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { result: "deliverable", score: 98 } }),
    );
    const result = await hunterAdapter.emailVerifier("k", "ada@acme.com");
    expect(result.text).toBe("ada@acme.com: deliverable (score 98)");
  });

  it("falls back to unknown and ? for missing fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));
    const result = await hunterAdapter.emailVerifier("k", "x@y.com");
    expect(result.text).toBe("x@y.com: unknown (score ?)");
  });
});
