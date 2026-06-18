import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vincereAdapter } from "@/lib/integrations/vincere";
import { jsonResponse, textResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The session (tenant host + api key) is resolved from /oauth2/user and cached
// per id_token, so each test uses a distinct token to avoid cross-test caching.
const userResponse = (tenant = "acme.vincere.io", apiKey = "key-123") =>
  jsonResponse({ email: "rec@acme.io", tenants: [{ tenant, apiKey }] });

describe("auth", () => {
  it("exchanges a code, storing the id_token as the access token", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id_token: "ID_TOK",
          access_token: "ACC",
          refresh_token: "REF",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(userResponse("acme.vincere.io"));

    const tokens = await vincereAdapter.exchangeCode!({
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://app/cb",
    });

    expect(tokens.accessToken).toBe("ID_TOK");
    expect(tokens.refreshToken).toBe("REF");
    expect(tokens.accountLabel).toBe("Vincere (acme)");
    // Capped at the id_token's 30-min ceiling, not the 3600s expires_in.
    expect(Date.parse(tokens.expiresAt!) - Date.now()).toBeLessThanOrEqual(
      1800 * 1000 + 50,
    );
    const [tokenUrl, init] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://id.vincere.io/oauth2/token");
    expect(String(init.body)).toContain("grant_type=authorization_code");
  });

  it("refreshes via the refresh_token grant", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id_token: "ID2", refresh_token: "REF2", expires_in: 1800 }),
    );
    const tokens = await vincereAdapter.refreshToken!("REF");
    expect(tokens.accessToken).toBe("ID2");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain(
      "grant_type=refresh_token",
    );
  });

  it("uses the per-workspace OAuth app credentials when supplied (BYO)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id_token: "ID3", expires_in: 1800 }),
    );
    await vincereAdapter.refreshToken!("REF", {
      clientId: "ws-client",
      clientSecret: "ws-secret",
    });
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain("client_id=ws-client");
    expect(body).toContain("client_secret=ws-secret");
  });

  it("builds the authorize URL with the workspace's client_id", () => {
    const url = vincereAdapter.getAuthorizeUrl!({
      state: "st",
      codeChallenge: "cc",
      redirectUri: "https://app/cb",
      app: { clientId: "ws-client" },
    });
    expect(url).toContain("https://id.vincere.io/oauth2/authorize?");
    expect(url).toContain("client_id=ws-client");
    expect(url).toContain("response_type=code");
  });
});

describe("searchCandidates", () => {
  it("calls the tenant host with both auth headers and a match-all default", async () => {
    fetchMock.mockResolvedValueOnce(userResponse("acme.vincere.io", "K")).mockResolvedValueOnce(
      jsonResponse({
        result: {
          total: 1,
          items: [
            {
              id: 42,
              name: "Jane Doe",
              email: "jane@x.io",
              mobile: "+44 1",
              current_job_title: "Engineer",
              current_employer: "Acme",
              current_location: "London",
            },
          ],
        },
      }),
    );

    const result = await vincereAdapter.searchCandidates("tok-cand", {});

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain("https://acme.vincere.io/api/v2/candidate/search/fl=");
    expect(url).toContain("sort=created_date%20desc");
    // URLSearchParams encodes the range's spaces as '+' (decoded back server-side).
    expect(url).toContain("q=id%3A%5B1+TO+*%5D");
    expect(init.headers["id-token"]).toBe("tok-cand");
    expect(init.headers["x-api-key"]).toBe("K");
    expect(result.count).toBe(1);
    expect(result.text).toContain("| Jane Doe | jane@x.io | +44 1 | Engineer | Acme | London | 42 |");
  });

  it("builds a name prefix query from the query keyword", async () => {
    fetchMock
      .mockResolvedValueOnce(userResponse())
      .mockResolvedValueOnce(jsonResponse({ result: { total: 0, items: [] } }));
    const result = await vincereAdapter.searchCandidates("tok-q", { query: "Smith" });
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain("q=name:Smith*");
    expect(result.text).toBe("_No candidates found._");
  });

  it("passes a raw q fragment through unchanged", async () => {
    fetchMock
      .mockResolvedValueOnce(userResponse())
      .mockResolvedValueOnce(jsonResponse({ result: { total: 0, items: [] } }));
    await vincereAdapter.searchCandidates("tok-raw", {
      query: "ignored",
      q: "current_job_title:engineer",
    });
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain(
      "q=current_job_title:engineer",
    );
  });
});

describe("searchCompanies / searchContacts", () => {
  it("renders companies", async () => {
    fetchMock.mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(
      jsonResponse({
        result: {
          total: 1,
          items: [{ id: 7, name: "Acme Ltd", industry: "Tech", website: "acme.io", city: "London", country: "UK" }],
        },
      }),
    );
    const result = await vincereAdapter.searchCompanies("tok-co", {});
    expect(fetchMock.mock.calls[1][0]).toContain("/api/v2/company/search/");
    expect(result.text).toContain("| Acme Ltd | Tech | acme.io |  | London, UK | 7 |");
  });

  it("renders contacts", async () => {
    fetchMock.mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(
      jsonResponse({
        result: { total: 1, items: [{ id: 9, first_name: "Bob", last_name: "Lee", email: "bob@x.io", job_title: "CTO", company_name: "Acme" }] },
      }),
    );
    const result = await vincereAdapter.searchContacts("tok-ct", {});
    expect(fetchMock.mock.calls[1][0]).toContain("/api/v2/contact/search/");
    expect(result.text).toContain("| Bob Lee | bob@x.io |  | CTO | Acme | 9 |");
  });
});

describe("searchApplications", () => {
  it("queries the application core and renders stage/status", async () => {
    fetchMock.mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(
      jsonResponse({
        result: {
          total: 1,
          items: [{ id: 5, candidate_name: "Jane Doe", job_title: "Engineer", stage: "shortlisted", status: "active", created_date: "2026-01-02T00:00:00Z" }],
        },
      }),
    );
    const result = await vincereAdapter.searchApplications("tok-app", { q: "job_id:1234" });
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain("/api/v2/application/search/");
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain("q=job_id:1234");
    expect(result.text).toContain("| Jane Doe | Engineer | shortlisted | active | 2026-01-02 | 5 |");
  });
});

describe("listTalentPools", () => {
  it("lists pools from a bare array response", async () => {
    fetchMock.mockResolvedValueOnce(userResponse()).mockResolvedValueOnce(
      jsonResponse([{ id: 1, name: "Senior Devs", description: "EU", candidate_count: 12 }]),
    );
    const result = await vincereAdapter.listTalentPools("tok-tp");
    expect(fetchMock.mock.calls[1][0]).toContain("/api/v2/talentpool");
    expect(result.count).toBe(1);
    expect(result.text).toContain("| Senior Devs | EU | 12 | 1 |");
  });
});

describe("errors", () => {
  it("throws with status and detail on a non-2xx API response", async () => {
    fetchMock
      .mockResolvedValueOnce(userResponse())
      .mockResolvedValueOnce(textResponse('{"message":"Data is invalid"}', 400));
    await expect(vincereAdapter.searchCandidates("tok-err", {})).rejects.toThrow(
      /Vincere candidate\/search.*\(400\).*Data is invalid/,
    );
  });

  it("throws when the account has no tenant api key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ email: "x", tenants: [] }));
    await expect(vincereAdapter.searchCandidates("tok-notenant", {})).rejects.toThrow(
      /no tenant/,
    );
  });
});
