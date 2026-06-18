import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  getAdapter,
  getValidAccessToken,
  isLiveConnector,
} from "@/lib/integrations";
import type { Connection } from "@/lib/types";
import { jsonResponse } from "../../helpers/http";

// Recorded db writes; the mock replaces the real Supabase client entirely.
const recorded = vi.hoisted(() => ({
  updates: [] as {
    table: string;
    values: Record<string, unknown>;
    eq: [string, string];
  }[],
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (col: string, val: string) => {
          recorded.updates.push({ table, values, eq: [col, val] });
          return { error: null };
        },
      }),
    }),
  }),
}));

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "conn-1",
    workspace_id: "ws-1",
    provider: "airtable",
    access_token_cipher: encrypt("access-token"),
    refresh_token_cipher: encrypt("refresh-token"),
    token_expires_at: null,
    account_label: null,
    scopes: "data.records:read",
    status: "active",
    oauth_client_id: null,
    oauth_client_secret_cipher: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  recorded.updates.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("adapter registry", () => {
  it("exposes the live connectors", () => {
    for (const provider of ["airtable", "apollo", "ashby", "contactout", "hunter"]) {
      expect(getAdapter(provider)?.provider).toBe(provider);
      expect(isLiveConnector(provider)).toBe(true);
    }
  });

  it("returns null for unknown providers", () => {
    expect(getAdapter("salesforce")).toBeNull();
    expect(isLiveConnector("salesforce")).toBe(false);
  });
});

describe("getValidAccessToken", () => {
  it("throws for an unknown provider without touching the db", async () => {
    await expect(
      getValidAccessToken(connection({ provider: "salesforce" })),
    ).rejects.toThrow("No adapter for salesforce");
    expect(recorded.updates).toHaveLength(0);
  });

  it("marks error and throws when no access token is stored", async () => {
    await expect(
      getValidAccessToken(connection({ access_token_cipher: null })),
    ).rejects.toThrow("airtable is not connected");
    expect(recorded.updates).toEqual([
      {
        table: "workspace_connections",
        values: { status: "error" },
        eq: ["id", "conn-1"],
      },
    ]);
  });

  it("returns the decrypted token when there is no expiry", async () => {
    await expect(getValidAccessToken(connection())).resolves.toBe(
      "access-token",
    );
    expect(recorded.updates).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the decrypted token when expiry is comfortably in the future", async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    await expect(
      getValidAccessToken(connection({ token_expires_at: future })),
    ).resolves.toBe("access-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a token expiring within the 60s skew as expired", async () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "fresh", expires_in: 3600 }),
    );
    await expect(
      getValidAccessToken(connection({ token_expires_at: soon })),
    ).resolves.toBe("fresh");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes an expired OAuth token and persists the rotated pair", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00.000Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        scope: "data.records:read schema.bases:read",
      }),
    );

    const token = await getValidAccessToken(
      connection({ token_expires_at: "2026-06-11T11:00:00.000Z" }),
    );
    expect(token).toBe("new-access");

    expect(recorded.updates).toHaveLength(1);
    const { table, values, eq } = recorded.updates[0];
    expect(table).toBe("workspace_connections");
    expect(eq).toEqual(["id", "conn-1"]);
    expect(values.status).toBe("active");
    expect(decrypt(values.access_token_cipher as string)).toBe("new-access");
    expect(decrypt(values.refresh_token_cipher as string)).toBe("new-refresh");
    expect(values.token_expires_at).toBe("2026-06-11T13:00:00.000Z");
    expect(values.scopes).toBe("data.records:read schema.bases:read");
  });

  it("keeps the old refresh token cipher when the provider doesn't rotate", async () => {
    const oldRefreshCipher = encrypt("refresh-token");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "new-access", expires_in: 3600 }),
    );
    await getValidAccessToken(
      connection({
        token_expires_at: "2020-01-01T00:00:00.000Z",
        refresh_token_cipher: oldRefreshCipher,
      }),
    );
    expect(recorded.updates[0].values.refresh_token_cipher).toBe(
      oldRefreshCipher,
    );
  });

  it("keeps the stored scopes when the refresh returns none", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "new-access", expires_in: 3600 }),
    );
    await getValidAccessToken(
      connection({ token_expires_at: "2020-01-01T00:00:00.000Z" }),
    );
    expect(recorded.updates[0].values.scopes).toBe("data.records:read");
  });

  it("is terminal for an api-key connector with an unreadable cipher", async () => {
    await expect(
      getValidAccessToken(
        connection({
          provider: "apollo",
          access_token_cipher: "not.a.cipher",
        }),
      ),
    ).rejects.toThrow("apollo connection couldn't be read");
    expect(recorded.updates[0].values).toEqual({ status: "error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks error when an expired connection has no refresh token", async () => {
    await expect(
      getValidAccessToken(
        connection({
          token_expires_at: "2020-01-01T00:00:00.000Z",
          refresh_token_cipher: null,
        }),
      ),
    ).rejects.toThrow("airtable connection expired");
    expect(recorded.updates[0].values).toEqual({ status: "error" });
  });

  it("marks error when the refresh token cipher is unreadable", async () => {
    await expect(
      getValidAccessToken(
        connection({
          token_expires_at: "2020-01-01T00:00:00.000Z",
          refresh_token_cipher: "garbage",
        }),
      ),
    ).rejects.toThrow("airtable connection couldn't be read");
    expect(recorded.updates[0].values).toEqual({ status: "error" });
  });

  it("marks error and surfaces the cause when the refresh endpoint fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("invalid_grant", { status: 500 }),
    );
    await expect(
      getValidAccessToken(
        connection({ token_expires_at: "2020-01-01T00:00:00.000Z" }),
      ),
    ).rejects.toThrow(/Couldn't refresh your airtable connection/);
    expect(recorded.updates[0].values).toEqual({ status: "error" });
  });

  it("falls through to refresh when an unexpired access cipher is unreadable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "recovered", expires_in: 3600 }),
    );
    await expect(
      getValidAccessToken(
        connection({
          access_token_cipher: "corrupted-cipher",
          token_expires_at: null,
        }),
      ),
    ).resolves.toBe("recovered");
    expect(recorded.updates[0].values.status).toBe("active");
  });
});
