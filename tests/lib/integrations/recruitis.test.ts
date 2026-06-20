import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recruitisAdapter } from "@/lib/integrations/recruitis";
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
  it("sends the token as a Bearer header against the api2 base", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    await recruitisAdapter.listJobs("my-token");
    const { url, headers } = requestAt(0);
    expect(url).toBe("https://app.recruitis.io/api2/jobs?limit=25&page=1");
    expect(headers.Authorization).toBe("Bearer my-token");
  });

  it("throws on a non-2xx response using the meta message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ meta: { message: "Invalid token" } }, 401),
    );
    await expect(recruitisAdapter.listJobs("bad")).rejects.toThrow(
      "Recruitis error (401): Invalid token",
    );
  });

  it("falls back to the status text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", 500));
    await expect(recruitisAdapter.listJobs("k")).rejects.toThrow(
      /Recruitis error \(500\)/,
    );
  });
});

describe("validateApiKey", () => {
  it("labels the account from /me", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ payload: { fullname: "Jana Novak", email: "j@x.cz" }, meta: {} }),
    );
    const result = await recruitisAdapter.validateApiKey!("k");
    expect(requestAt(0).url).toBe("https://app.recruitis.io/api2/me");
    expect(result).toEqual({ ok: true, accountLabel: "Recruitis (Jana Novak)" });
  });

  it("returns the failure message for a rejected token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ meta: { message: "Unauthorized" } }, 401),
    );
    const result = await recruitisAdapter.validateApiKey!("k");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Recruitis error (401): Unauthorized");
  });
});

describe("listJobs", () => {
  const jobs = [
    {
      job_id: 1,
      title: "Engineer",
      active: true,
      addresses: [{ city: "Praha", region: "Praha" }],
      salary: { min: 50000, max: 70000, currency: "CZK", unit: "month" },
      contact: { employee: { name: "Petra", surname: "K" } },
    },
    { job_id: 2, title: "Designer", draft: true },
  ];

  it("renders jobs with status, location, salary and recruiter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: jobs, meta: {} }));
    const result = await recruitisAdapter.listJobs("k");
    expect(result.count).toBe(2);
    expect(result.text).toContain(
      "| Engineer | active | Praha, Praha | 50000–70000 CZK/month | Petra K | 1 |",
    );
    expect(result.text).toContain("| Designer | draft |  |  |  | 2 |");
  });

  it("passes activity_state when activeOnly is set", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    await recruitisAdapter.listJobs("k", { activeOnly: true, page: 2, limit: 10 });
    expect(requestAt(0).url).toBe(
      "https://app.recruitis.io/api2/jobs?limit=10&page=2&activity_state=1",
    );
  });

  it("reports truncation when more pages remain per meta.entries_total", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ payload: jobs, meta: { entries_total: 100 } }),
    );
    const result = await recruitisAdapter.listJobs("k");
    expect(result.truncated).toBe(true);
  });

  it("renders a placeholder when there are no jobs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    const result = await recruitisAdapter.listJobs("k");
    expect(result.text).toBe("_No jobs._");
    expect(result.count).toBe(0);
  });
});

describe("listCandidates", () => {
  it("renders applications with stage from either a number or an object", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        payload: [
          {
            candidate_id: 11,
            candidate_name: "Ada L",
            candidate_email: "ada@x.cz",
            candidate_phone: "+420 1",
            job_title: "Engineer",
            flow: { id: 3, name: "Interview" },
            date_created: "2026-06-01",
          },
          {
            candidate_id: 12,
            candidate_name: "Bo K",
            job_title: "Designer",
            flow: 2,
          },
        ],
        meta: {},
      }),
    );
    const result = await recruitisAdapter.listCandidates("k");
    expect(result.count).toBe(2);
    expect(result.text).toContain(
      "| Ada L | ada@x.cz | +420 1 | Engineer | Interview | 2026-06-01 | 11 |",
    );
    expect(result.text).toContain("| Bo K |  |  | Designer | 2 |  | 12 |");
  });

  it("scopes to one job's pipeline via job_id[]", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    await recruitisAdapter.listCandidates("k", { jobId: "42" });
    expect(requestAt(0).url).toBe(
      "https://app.recruitis.io/api2/answers?limit=25&page=1&job_id%5B%5D=42",
    );
  });

  it("clamps the requested limit to the 50 hard cap", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    await recruitisAdapter.listCandidates("k", { limit: 999 });
    expect(requestAt(0).url).toContain("limit=50");
  });

  it("renders a placeholder when empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ payload: [], meta: {} }));
    const result = await recruitisAdapter.listCandidates("k");
    expect(result.text).toBe("_No candidates._");
  });
});
