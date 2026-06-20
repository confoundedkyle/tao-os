import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropcontactAdapter } from "@/lib/integrations/dropcontact";
import { jsonResponse, textResponse } from "../../helpers/http";

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
    headers: (init as RequestInit).headers as Record<string, string>,
    body: (init as RequestInit).body
      ? JSON.parse(String((init as RequestInit).body))
      : undefined,
  };
}

describe("auth and errors", () => {
  it("sends the key as an X-Access-Token header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: "r1" }));
    await dropcontactAdapter.enrich("my-key", { email: "a@b.com" });
    const { url, headers } = lastCall();
    expect(url).toBe("https://api.dropcontact.com/v1/enrich/all");
    expect(headers["X-Access-Token"]).toBe("my-key");
  });

  it("throws on a non-2xx response using the reason field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reason: "Invalid token" }, 403),
    );
    await expect(
      dropcontactAdapter.getResult("bad", { requestId: "r1" }),
    ).rejects.toThrow("Dropcontact error (403): Invalid token");
  });

  it("falls back to status text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", 500));
    await expect(
      dropcontactAdapter.getResult("k", { requestId: "r1" }),
    ).rejects.toThrow(/Dropcontact error \(500\)/);
  });
});

describe("validateApiKey", () => {
  it("posts one empty object and labels the account with remaining credits", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, credits_left: 1234, request_id: "r" }),
    );
    const result = await dropcontactAdapter.validateApiKey!("k");
    expect(lastCall().body).toEqual({ data: [{}] });
    expect(result).toEqual({ ok: true, accountLabel: "Dropcontact (1234 credits)" });
  });

  it("returns the failure message for a rejected key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: "Unauthorized" }, 401));
    const result = await dropcontactAdapter.validateApiKey!("k");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Dropcontact error (401): Unauthorized");
  });
});

describe("enrich", () => {
  it("maps camelCase fields to Dropcontact's snake_case row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: "abc" }));
    await dropcontactAdapter.enrich("k", {
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
      linkedin: "https://linkedin.com/in/ada",
    });
    const { body } = lastCall();
    expect(body).toEqual({
      data: [
        {
          first_name: "Ada",
          last_name: "Lovelace",
          company: "Analytical Engines",
          linkedin: "https://linkedin.com/in/ada",
        },
      ],
      language: "en",
    });
  });

  it("returns a pending result carrying the request id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: "req-42" }));
    const result = await dropcontactAdapter.enrich("k", { email: "a@b.com" });
    expect(result.pending).toBe(true);
    expect(result.text).toContain("req-42");
  });

  it("rejects an empty contact without calling the API", async () => {
    const result = await dropcontactAdapter.enrich("k", {});
    expect(result.pending).toBe(false);
    expect(result.text).toContain("Provide at least one of");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getResult", () => {
  it("renders a finished enrichment, picking the first email + qualification", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          {
            first_name: "Ada",
            last_name: "Lovelace",
            job: "Mathematician",
            company: "Analytical Engines",
            email: [{ email: "ada@engines.co", qualification: "nominative@pro" }],
            phone: [{ number: "+44 20 0000" }],
            linkedin: "https://linkedin.com/in/ada",
          },
        ],
      }),
    );
    const result = await dropcontactAdapter.getResult("k", { requestId: "r" });
    expect(result.pending).toBe(false);
    expect(result.text).toContain("**Ada Lovelace** — Mathematician at Analytical Engines");
    expect(result.text).toContain("Email: ada@engines.co (nominative@pro)");
    expect(result.text).toContain("Phone: +44 20 0000");
  });

  it("treats success:false as still-processing (pending)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, request_id: "r9", reason: "in progress" }),
    );
    const result = await dropcontactAdapter.getResult("k", { requestId: "r9" });
    expect(result.pending).toBe(true);
    expect(result.text).toContain("r9");
    expect(result.text).toContain("in progress");
  });

  it("requires a requestId", async () => {
    const result = await dropcontactAdapter.getResult("k", { requestId: "" });
    expect(result.text).toContain("Provide the requestId");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
