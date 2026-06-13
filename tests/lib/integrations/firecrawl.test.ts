import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firecrawlMap, firecrawlScrape } from "@/lib/integrations/firecrawl";
import { jsonResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return {
    url: url as string,
    init: init as RequestInit,
    body: JSON.parse(String((init as RequestInit).body)),
    headers: (init as RequestInit).headers as Record<string, string>,
  };
}

describe("firecrawlMap", () => {
  it("posts to /v2/map for the domain with a bearer token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [] }));
    await firecrawlMap("fc-key", { domain: "acme.com" });
    const { url, init, body, headers } = lastCall();
    expect(url).toBe("https://api.firecrawl.dev/v2/map");
    expect(init.method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer fc-key");
    expect(body.url).toBe("https://acme.com");
  });

  it("normalises string and object links and de-duplicates", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        links: [
          "https://acme.com",
          { url: "https://acme.com/about", title: "About" },
          "https://acme.com", // duplicate
          { url: "" }, // dropped
          { title: "no url" }, // dropped
        ],
      }),
    );
    const { links } = await firecrawlMap("k", { domain: "acme.com" });
    expect(links).toEqual([
      { url: "https://acme.com", title: undefined },
      { url: "https://acme.com/about", title: "About" },
    ]);
  });

  it("omits an empty search and clamps the limit to 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [] }));
    await firecrawlMap("k", { domain: "acme.com", search: "", limit: 999 });
    const { body } = lastCall();
    expect(body.search).toBeUndefined();
    expect(body.limit).toBe(200);
  });

  it("forwards a non-empty search keyword", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [] }));
    await firecrawlMap("k", { domain: "acme.com", search: "about" });
    expect(lastCall().body.search).toBe("about");
  });

  it("tolerates a missing links array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const { links } = await firecrawlMap("k", { domain: "acme.com" });
    expect(links).toEqual([]);
  });

  it("throws a descriptive error on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Invalid token" }, 401),
    );
    await expect(firecrawlMap("bad", { domain: "acme.com" })).rejects.toThrow(
      "Firecrawl error (401): Invalid token",
    );
  });
});

describe("firecrawlScrape", () => {
  it("requests markdown for a single page", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { markdown: "# Hello", metadata: { title: "Home" } },
      }),
    );
    const result = await firecrawlScrape("k", { url: "https://acme.com" });
    expect(result).toEqual({
      markdown: "# Hello",
      title: "Home",
      truncated: false,
    });
    const { url, body } = lastCall();
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(body).toMatchObject({
      url: "https://acme.com",
      formats: ["markdown"],
      onlyMainContent: true,
    });
  });

  it("truncates oversized markdown and flags it", async () => {
    const huge = "x".repeat(12_001);
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { markdown: huge } }));
    const result = await firecrawlScrape("k", { url: "https://acme.com" });
    expect(result.truncated).toBe(true);
    expect(result.markdown.endsWith("…")).toBe(true);
    expect(result.markdown.length).toBe(12_001); // 12_000 chars + ellipsis
  });

  it("returns empty markdown when the page has no content", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));
    const result = await firecrawlScrape("k", { url: "https://acme.com" });
    expect(result).toEqual({
      markdown: "",
      title: undefined,
      truncated: false,
    });
  });

  it("surfaces message when error field is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "rate limited" }, 429),
    );
    await expect(
      firecrawlScrape("k", { url: "https://acme.com" }),
    ).rejects.toThrow("Firecrawl error (429): rate limited");
  });
});
