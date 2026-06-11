import "server-only";

// A connector adapter wraps one external data source. Connectors authenticate
// either via OAuth2 (e.g. Airtable) or a pasted API key (e.g. Ashby) — the
// shared interface covers only auth; each adapter exposes its own read ops as a
// richer type (see AirtableAdapter / AshbyAdapter) consumed by its own tools.

export type ConnectorAuthType = "oauth" | "apikey";

export interface OAuthTokens {
  accessToken: string;
  /** May be undefined when a provider omits rotation on a given exchange. */
  refreshToken?: string;
  /** Absolute expiry (ISO string), or null if the provider returns none. */
  expiresAt: string | null;
  /** Human-readable account label for the Settings UI (email/user/workspace). */
  accountLabel?: string;
  /** Space-separated granted scopes, if the provider returns them. */
  scopes?: string;
}

/** A queryable container in the source (Airtable: a table within a base). */
export interface ResourceRef {
  baseId: string;
  tableId: string;
}

export interface ConnectorAdapter {
  provider: string;
  authType: ConnectorAuthType;

  // --- OAuth connectors ---
  getAuthorizeUrl?(args: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  exchangeCode?(args: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthTokens>;
  refreshToken?(refreshToken: string): Promise<OAuthTokens>;

  // --- API-key connectors ---
  /** Validate a pasted key and (optionally) return a display label. */
  validateApiKey?(
    apiKey: string,
  ): Promise<{ ok: boolean; accountLabel?: string; message?: string }>;
}
