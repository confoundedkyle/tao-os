import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactoutAdapter } from "@/lib/integrations/contactout";
import { jsonResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRequest(): { url: URL; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: new URL(url), init: init ?? {} };
}

describe("validateApiKey", () => {
  it("reads the free stats endpoint with the token header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status_code: 200 }));
    const result = await contactoutAdapter.validateApiKey!("key-1");
    expect(result).toEqual({ ok: true, accountLabel: "ContactOut account" });
    const { url, init } = lastRequest();
    expect(url.origin + url.pathname).toBe("https://api.contactout.com/v1/stats");
    const headers = init.headers as Record<string, string>;
    expect(headers.token).toBe("key-1");
    expect(headers.authorization).toBe("basic");
  });

  it("surfaces the error message on a rejected key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "invalid token" }, 401),
    );
    const result = await contactoutAdapter.validateApiKey!("bad");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("ContactOut error (401): invalid token");
  });
});

describe("linkedinEnrich", () => {
  it("requires a profile URL", async () => {
    const result = await contactoutAdapter.linkedinEnrich("k", {
      profileUrl: "",
    });
    expect(result.found).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports found only when contact details came back", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        profile: {
          full_name: "Ada Lovelace",
          headline: "CTO",
          company: { name: "Acme" },
          work_email: ["ada@acme.com"],
          phone: ["+44 123"],
        },
      }),
    );
    const result = await contactoutAdapter.linkedinEnrich("k", {
      profileUrl: "https://linkedin.com/in/ada",
    });
    expect(result.found).toBe(true);
    expect(result.text).toContain("**Ada Lovelace** — CTO at Acme");
    expect(result.text).toContain("Work emails: ada@acme.com");
    expect(result.text).toContain("Phones: +44 123");
    expect(result.text).toContain("LinkedIn: https://linkedin.com/in/ada");
  });

  it("is found in profileOnly mode even without contacts", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ profile: { full_name: "Ada" } }),
    );
    const result = await contactoutAdapter.linkedinEnrich("k", {
      profileUrl: "https://linkedin.com/in/ada",
      profileOnly: true,
    });
    expect(result.found).toBe(true);
    const { url } = lastRequest();
    expect(url.searchParams.get("profile_only")).toBe("true");
  });

  it("is not found when the profile is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: null }));
    const result = await contactoutAdapter.linkedinEnrich("k", {
      profileUrl: "https://linkedin.com/in/ghost",
    });
    expect(result.found).toBe(false);
  });
});

describe("personEnrich", () => {
  it("requires a name, linkedin URL, or email", async () => {
    const result = await contactoutAdapter.personEnrich("k", {
      companies: ["Acme"],
    });
    expect(result.found).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires an anchor besides the name", async () => {
    const result = await contactoutAdapter.personEnrich("k", {
      fullName: "Ada Lovelace",
    });
    expect(result.found).toBe(false);
    expect(result.text).toContain("anchor");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the mapped body with the default include list", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        profile: { full_name: "Ada", personal_email: ["ada@gmail.com"] },
      }),
    );
    const result = await contactoutAdapter.personEnrich("k", {
      fullName: "Ada Lovelace",
      companyDomain: "acme.com",
      jobTitle: "CTO",
    });
    expect(result.found).toBe(true);
    const { url, init } = lastRequest();
    expect(url.pathname).toBe("/v1/people/enrich");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      include: ["work_email", "personal_email", "phone"],
      full_name: "Ada Lovelace",
      company_domain: "acme.com",
      job_title: "CTO",
    });
  });
});

describe("emailVerify", () => {
  it("formats the verification status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { status: "deliverable" } }),
    );
    const result = await contactoutAdapter.emailVerify("k", "ada@acme.com");
    expect(result.text).toBe("ada@acme.com: deliverable");
  });
});

describe("peopleSearch", () => {
  it("requires at least one filter", async () => {
    const result = await contactoutAdapter.peopleSearch("k", {});
    expect(result.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps filters, clamps the limit to 25, and reports totals", async () => {
    const profiles: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      profiles[`https://linkedin.com/in/p${i}`] = {
        full_name: `Person ${i}`,
        title: "Engineer",
      };
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        metadata: { page: 2, total_results: 500 },
        profiles,
      }),
    );
    const result = await contactoutAdapter.peopleSearch("k", {
      jobTitles: ["Engineer"],
      locations: ["Berlin"],
      page: 2,
      limit: 999,
    });
    const { init } = lastRequest();
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      page: 2,
      reveal_info: false,
      job_title: ["Engineer"],
      location: ["Berlin"],
    });
    expect(result.count).toBe(25);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("_Page 2 — 500 total matches._");
  });

  it("renders a placeholder when nothing matches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ profiles: {} }));
    const result = await contactoutAdapter.peopleSearch("k", { name: "ghost" });
    expect(result.text).toBe("_No profiles found._");
    expect(result.count).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
