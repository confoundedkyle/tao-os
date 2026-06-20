import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replyioAdapter } from "@/lib/integrations/replyio";
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
  it("sends the key as a Bearer header against the v3 base", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], hasMore: false }));
    await replyioAdapter.listSequences("my-key");
    const { url, headers } = requestAt(0);
    expect(url).toBe("https://api.reply.io/v3/sequences?top=25");
    expect(headers.Authorization).toBe("Bearer my-key");
  });

  it("throws on a non-2xx response using the problem detail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "Invalid API key" }, 401));
    await expect(replyioAdapter.listSequences("bad")).rejects.toThrow(
      "Reply.io error (401): Invalid API key",
    );
  });

  it("falls back to status text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", 500));
    await expect(replyioAdapter.listContacts("k")).rejects.toThrow(
      /Reply\.io error \(500\)/,
    );
  });
});

describe("validateApiKey", () => {
  it("labels the account from /v3/whoami", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ email: "rec@agency.com", fullName: "Rec Ruiter" }),
    );
    const result = await replyioAdapter.validateApiKey!("k");
    expect(requestAt(0).url).toBe("https://api.reply.io/v3/whoami");
    expect(result).toEqual({ ok: true, accountLabel: "Reply.io (rec@agency.com)" });
  });

  it("returns the failure message for a rejected key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401));
    const result = await replyioAdapter.validateApiKey!("k");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Reply.io error (401): Unauthorized");
  });
});

describe("listSequences", () => {
  it("renders sequences and passes top/skip/status params", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: 7, name: "Q3 Outbound", status: "active", health: "healthy", created: "2026-06-01T10:00:00Z" },
        ],
        hasMore: false,
      }),
    );
    const result = await replyioAdapter.listSequences("k", { status: "active", limit: 10, skip: 20 });
    expect(requestAt(0).url).toBe(
      "https://api.reply.io/v3/sequences?top=10&skip=20&status=active",
    );
    expect(result.count).toBe(1);
    expect(result.text).toContain("| Q3 Outbound | active | healthy | 2026-06-01 | 7 |");
  });

  it("reports truncation from hasMore", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 1, name: "S" }], hasMore: true }),
    );
    const result = await replyioAdapter.listSequences("k");
    expect(result.truncated).toBe(true);
  });

  it("renders a placeholder when there are no sequences", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], hasMore: false }));
    const result = await replyioAdapter.listSequences("k");
    expect(result.text).toBe("_No sequences._");
    expect(result.count).toBe(0);
  });
});

describe("listContacts", () => {
  it("renders contacts and filters by email", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 11,
            email: "ada@acme.com",
            firstName: "Ada",
            lastName: "Lovelace",
            company: "Acme",
            title: "CTO",
            phone: "+1 555",
            linkedInUrl: "https://linkedin.com/in/ada",
          },
        ],
        hasMore: false,
      }),
    );
    const result = await replyioAdapter.listContacts("k", { email: "ada@acme.com" });
    expect(requestAt(0).url).toBe(
      "https://api.reply.io/v3/contacts?top=25&email=ada%40acme.com",
    );
    expect(result.text).toContain(
      "| Ada Lovelace | ada@acme.com | Acme | CTO | +1 555 | https://linkedin.com/in/ada | 11 |",
    );
  });

  it("renders a placeholder when empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], hasMore: false }));
    const result = await replyioAdapter.listContacts("k");
    expect(result.text).toBe("_No contacts found._");
  });

  it("clamps the requested limit to the 100 hard cap", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], hasMore: false }));
    await replyioAdapter.listContacts("k", { limit: 999 });
    expect(requestAt(0).url).toContain("top=100");
  });
});
