import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { airtableAdapter, AIRTABLE_SCOPES } from "@/lib/integrations/airtable";
import { jsonResponse, textResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function requestAt(index: number): {
  url: string;
  headers: Record<string, string>;
  params: URLSearchParams;
} {
  const [url, init] = fetchMock.mock.calls[index];
  return {
    url,
    headers: (init?.headers ?? {}) as Record<string, string>,
    params: new URLSearchParams(String(init?.body ?? "")),
  };
}

const expectedBasicAuth = `Basic ${Buffer.from(
  "test-airtable-client-id:test-airtable-client-secret",
).toString("base64")}`;

describe("getAuthorizeUrl", () => {
  it("builds the PKCE authorize URL", () => {
    const url = new URL(
      airtableAdapter.getAuthorizeUrl!({
        state: "state-1",
        codeChallenge: "challenge-1",
        redirectUri: "https://app.example.com/callback",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://airtable.com/oauth2/v1/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-airtable-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(AIRTABLE_SCOPES);
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("refreshToken", () => {
  it("posts the refresh grant with basic auth and maps the response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00.000Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        scope: "data.records:read",
      }),
    );
    const tokens = await airtableAdapter.refreshToken!("old-refresh");
    expect(tokens).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: "2026-06-11T13:00:00.000Z",
      scopes: "data.records:read",
    });
    const { url, headers, params } = requestAt(0);
    expect(url).toBe("https://airtable.com/oauth2/v1/token");
    expect(headers.Authorization).toBe(expectedBasicAuth);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old-refresh");
  });

  it("returns a null expiry when the provider omits expires_in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "a" }));
    const tokens = await airtableAdapter.refreshToken!("r");
    expect(tokens.expiresAt).toBeNull();
    expect(tokens.refreshToken).toBeUndefined();
  });

  it("throws with status and body on a failed exchange", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("invalid_grant", 400));
    await expect(airtableAdapter.refreshToken!("r")).rejects.toThrow(
      "Airtable token exchange failed (400): invalid_grant",
    );
  });
});

describe("exchangeCode", () => {
  it("exchanges the code with the PKCE verifier and labels via whoami", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-1", refresh_token: "refresh-1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "usr1", email: "me@example.com" }),
      );
    const tokens = await airtableAdapter.exchangeCode!({
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "https://app.example.com/callback",
    });
    expect(tokens.accountLabel).toBe("me@example.com");
    const { params } = requestAt(0);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code-1");
    expect(params.get("code_verifier")).toBe("verifier-1");
    const [whoamiUrl, whoamiInit] = fetchMock.mock.calls[1];
    expect(whoamiUrl).toBe("https://api.airtable.com/v0/meta/whoami");
    expect((whoamiInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-1",
    );
  });

  it("swallows a whoami failure and leaves the label unset", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-1" }))
      .mockResolvedValueOnce(textResponse("forbidden", 403));
    const tokens = await airtableAdapter.exchangeCode!({
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://x",
    });
    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.accountLabel).toBeUndefined();
  });
});

describe("metadata", () => {
  it("lists bases", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ bases: [{ id: "b1", name: "CRM", extra: "ignored" }] }),
    );
    await expect(airtableAdapter.listBases("token")).resolves.toEqual([
      { id: "b1", name: "CRM" },
    ]);
  });

  it("lists tables for a base", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tables: [{ id: "t1", name: "Candidates" }] }),
    );
    await expect(airtableAdapter.listTables("token", "b1")).resolves.toEqual([
      { id: "t1", name: "Candidates" },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.airtable.com/v0/meta/bases/b1/tables",
    );
  });
});

describe("queryRecords", () => {
  it("passes the filter formula and renders a field-union table", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        records: [
          { id: "r1", fields: { Name: "Ada", Stage: "Offer" } },
          { id: "r2", fields: { Name: "Grace", Email: "g@x.com" } },
        ],
      }),
    );
    const result = await airtableAdapter.queryRecords("token", {
      baseId: "b1",
      tableId: "t1",
      filterFormula: "{Stage}='Offer'",
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v0/b1/t1");
    expect(url.searchParams.get("filterByFormula")).toBe("{Stage}='Offer'");
    expect(result.recordCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("| Name | Stage | Email |");
    expect(result.text).toContain("| Ada | Offer |  |");
    expect(result.text).toContain("| Grace |  | g@x.com |");
  });

  it("joins array field values with commas", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        records: [{ id: "r1", fields: { Skills: ["sql", "python"] } }],
      }),
    );
    const result = await airtableAdapter.queryRecords("token", {
      baseId: "b1",
      tableId: "t1",
    });
    expect(result.text).toContain("| sql, python |");
  });

  it("paginates via offset and clamps to the 200-record hard cap", async () => {
    const page = (start: number, count: number, offset?: string) =>
      jsonResponse({
        records: Array.from({ length: count }, (_, i) => ({
          id: `r${start + i}`,
          fields: { Name: `Row ${start + i}` },
        })),
        ...(offset ? { offset } : {}),
      });
    fetchMock
      .mockResolvedValueOnce(page(0, 100, "off-1"))
      .mockResolvedValueOnce(page(100, 100, "off-2"));

    const result = await airtableAdapter.queryRecords("token", {
      baseId: "b1",
      tableId: "t1",
      maxRecords: 999,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0][0]);
    const second = new URL(fetchMock.mock.calls[1][0]);
    expect(first.searchParams.get("pageSize")).toBe("100");
    expect(first.searchParams.has("offset")).toBe(false);
    expect(second.searchParams.get("offset")).toBe("off-1");
    expect(result.recordCount).toBe(200);
    expect(result.truncated).toBe(true);
  });

  it("renders a placeholder for an empty table", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ records: [] }));
    const result = await airtableAdapter.queryRecords("token", {
      baseId: "b1",
      tableId: "t1",
    });
    expect(result.text).toBe("_No records._");
    expect(result.recordCount).toBe(0);
  });
});
