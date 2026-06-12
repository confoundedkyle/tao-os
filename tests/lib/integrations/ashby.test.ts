import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ashbyAdapter } from "@/lib/integrations/ashby";
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
  body: Record<string, unknown>;
} {
  const [url, init] = fetchMock.mock.calls[index];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  };
}

describe("auth and errors", () => {
  it("sends the api key as basic auth with an empty password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: [] }));
    await ashbyAdapter.listJobs("my-key");
    const { url, headers } = requestAt(0);
    expect(url).toBe("https://api.ashbyhq.com/job.list");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("my-key:").toString("base64")}`,
    );
  });

  it("throws on a non-2xx response with resource and status", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("unauthorized", 401));
    await expect(ashbyAdapter.listJobs("bad")).rejects.toThrow(
      "Ashby job.list failed (401): unauthorized",
    );
  });

  it("throws when a 200 response carries success=false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, errors: ["invalid_field"] }),
    );
    await expect(ashbyAdapter.listJobs("k")).rejects.toThrow(
      'Ashby job.list error: ["invalid_field"]',
    );
  });
});

describe("validateApiKey", () => {
  it("accepts a key that can list jobs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: [] }));
    const result = await ashbyAdapter.validateApiKey!("k");
    expect(result).toEqual({ ok: true, accountLabel: "Ashby workspace" });
  });

  it("returns the failure message for a rejected key", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", 401));
    const result = await ashbyAdapter.validateApiKey!("k");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Ashby job.list failed (401)");
  });
});

describe("listJobs", () => {
  const jobs = [
    { id: "j1", title: "Engineer", status: "Open", locationName: "Berlin" },
    { id: "j2", title: "Designer", status: "Closed", locationName: null },
  ];

  it("renders all jobs in a table", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: jobs }));
    const result = await ashbyAdapter.listJobs("k");
    expect(result.count).toBe(2);
    expect(result.text).toContain("| Engineer | Open | Berlin | j1 |");
    expect(result.text).toContain("| Designer | Closed |  | j2 |");
  });

  it("filters to open jobs when openOnly is set", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: jobs }));
    const result = await ashbyAdapter.listJobs("k", { openOnly: true });
    expect(result.count).toBe(1);
    expect(result.text).not.toContain("Designer");
  });

  it("reports truncation from moreDataAvailable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, results: jobs, moreDataAvailable: true }),
    );
    const result = await ashbyAdapter.listJobs("k");
    expect(result.truncated).toBe(true);
  });

  it("renders a placeholder when there are no jobs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: [] }));
    const result = await ashbyAdapter.listJobs("k");
    expect(result.text).toBe("_No jobs._");
    expect(result.count).toBe(0);
  });
});

describe("listCandidates", () => {
  function candidate(i: number) {
    return {
      id: `c${i}`,
      name: `Candidate ${i}`,
      primaryEmailAddress: { value: `c${i}@x.com` },
      location: { locationSummary: "Berlin" },
      position: "Engineer",
      company: "Acme",
    };
  }

  it("paginates with the cursor until the target is reached", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          results: Array.from({ length: 100 }, (_, i) => candidate(i)),
          moreDataAvailable: true,
          nextCursor: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          results: Array.from({ length: 20 }, (_, i) => candidate(100 + i)),
          moreDataAvailable: false,
        }),
      );

    const result = await ashbyAdapter.listCandidates("k", { limit: 120 });
    expect(result.count).toBe(120);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First page asks for the per-request max, second for the remainder.
    expect(requestAt(0).body).toEqual({ limit: 100 });
    expect(requestAt(1).body).toEqual({ limit: 20, cursor: "page-2" });
  });

  it("clamps the requested limit to the 200 hard cap", async () => {
    // A fresh Response per call — a body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          results: Array.from({ length: 100 }, (_, i) => candidate(i)),
          moreDataAvailable: true,
          nextCursor: "next",
        }),
      ),
    );
    const result = await ashbyAdapter.listCandidates("k", { limit: 999 });
    expect(result.count).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.truncated).toBe(true);
  });

  it("falls back to emailAddresses and string locations when rendering", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        results: [
          {
            id: "c1",
            name: "Jo",
            emailAddresses: [{ value: "jo@x.com" }],
            location: "Remote",
          },
        ],
      }),
    );
    const result = await ashbyAdapter.listCandidates("k");
    expect(result.text).toContain("| Jo | jo@x.com | Remote |  |  |");
  });

  it("renders a placeholder when empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: [] }));
    const result = await ashbyAdapter.listCandidates("k");
    expect(result.text).toBe("_No candidates._");
  });
});

describe("searchCandidates", () => {
  it("matches the query against both name and email", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, results: [] }));
    await ashbyAdapter.searchCandidates("k", { query: "ada" });
    const { url, body } = requestAt(0);
    expect(url).toBe("https://api.ashbyhq.com/candidate.search");
    expect(body).toEqual({ name: "ada", email: "ada" });
  });
});
