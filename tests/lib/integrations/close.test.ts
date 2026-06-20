import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAdapter } from "@/lib/integrations/close";
import { jsonResponse, textResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestAt(index: number): {
  url: string;
  headers: Record<string, string>;
} {
  const [url, init] = fetchMock.mock.calls[index];
  return { url, headers: init.headers as Record<string, string> };
}

describe("auth and errors", () => {
  it("sends the api key as basic auth with an empty password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    await closeAdapter.searchLeads("api_my-key");
    const { url, headers } = requestAt(0);
    expect(url).toBe("https://api.close.com/api/v1/lead/?_limit=25");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("api_my-key:").toString("base64")}`,
    );
  });

  it("throws on a non-2xx response using the error field", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid api key" }, 401));
    await expect(closeAdapter.searchLeads("bad")).rejects.toThrow(
      "Close error (401): invalid api key",
    );
  });

  it("falls back to status text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", 500));
    await expect(closeAdapter.listOpportunities("k")).rejects.toThrow(
      /Close error \(500\)/,
    );
  });
});

describe("validateApiKey", () => {
  it("labels the account from the first organization name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ first_name: "Rec", email: "r@a.com", organizations: [{ name: "Acme Recruiting" }] }),
    );
    const result = await closeAdapter.validateApiKey!("k");
    expect(requestAt(0).url).toBe("https://api.close.com/api/v1/me/");
    expect(result).toEqual({ ok: true, accountLabel: "Close (Acme Recruiting)" });
  });

  it("returns the failure message for a rejected key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
    const result = await closeAdapter.validateApiKey!("k");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Close error (401): Unauthorized");
  });
});

describe("searchLeads", () => {
  it("renders leads with the primary contact and passes query/skip", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "lead_1",
            display_name: "Acme Corp",
            status_label: "Potential",
            contacts: [
              {
                name: "Ada Lovelace",
                title: "CTO",
                emails: [{ email: "ada@acme.com" }],
                phones: [{ phone: "+1 555" }],
              },
            ],
          },
        ],
        has_more: false,
      }),
    );
    const result = await closeAdapter.searchLeads("k", { query: "acme", skip: 50 });
    expect(requestAt(0).url).toBe(
      "https://api.close.com/api/v1/lead/?query=acme&_limit=25&_skip=50",
    );
    expect(result.count).toBe(1);
    expect(result.text).toContain(
      "| Acme Corp | Potential | Ada Lovelace, CTO | ada@acme.com | +1 555 | lead_1 |",
    );
  });

  it("reports truncation from has_more and clamps the limit", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "l", display_name: "X" }], has_more: true }),
    );
    const result = await closeAdapter.searchLeads("k", { limit: 999 });
    expect(requestAt(0).url).toContain("_limit=100");
    expect(result.truncated).toBe(true);
  });

  it("renders a placeholder when there are no leads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    const result = await closeAdapter.searchLeads("k");
    expect(result.text).toBe("_No leads found._");
  });
});

describe("listOpportunities", () => {
  it("renders opportunities and scopes to a lead", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "oppo_1",
            lead_name: "Acme Corp",
            status_label: "Active",
            value_formatted: "$12,000",
            confidence: 60,
            date_created: "2026-06-10T09:00:00Z",
          },
        ],
        has_more: false,
      }),
    );
    const result = await closeAdapter.listOpportunities("k", { leadId: "lead_1" });
    expect(requestAt(0).url).toBe(
      "https://api.close.com/api/v1/opportunity/?lead_id=lead_1&_limit=25",
    );
    expect(result.text).toContain(
      "| Acme Corp | Active | $12,000 | 60% | 2026-06-10 | oppo_1 |",
    );
  });

  it("renders a placeholder when empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    const result = await closeAdapter.listOpportunities("k");
    expect(result.text).toBe("_No opportunities found._");
  });
});
