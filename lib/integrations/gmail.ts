import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Gmail exposes a send op beyond the shared auth interface; its tool imports
// this concrete type.
export interface GmailAdapter extends ConnectorAdapter {
  sendEmail(
    accessToken: string,
    args: { to: string; subject: string; body: string; cc?: string },
  ): Promise<{ id: string }>;
}

// Google OAuth2 (PKCE + client secret — same OAuth app as the Sheets
// connector, different scopes). gmail.send is the least-privileged scope that
// allows sending; it grants no read access to the mailbox. Refresh tokens are
// long-lived and do NOT rotate (getValidAccessToken keeps the old one when a
// refresh response omits it). access_type=offline + prompt=consent are
// required or Google only issues a refresh token on the very first consent.
const OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "email",
].join(" ");

function tokensFromResponse(json: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): OAuthTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    scopes: json.scope,
  };
}

async function postToken(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

/** RFC 2047 B-encoding so non-ASCII subjects survive transport. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?utf-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export const gmailAdapter: GmailAdapter = {
  provider: "gmail",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const tokens = await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        code_verifier: codeVerifier,
      }),
    );
    // Best-effort account label from the OIDC userinfo endpoint.
    try {
      const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (res.ok) {
        const who = (await res.json()) as { email?: string };
        tokens.accountLabel = who.email;
      }
    } catch {
      // Non-fatal — leave the label unset.
    }
    return tokens;
  },

  async refreshToken(refreshToken) {
    return postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
      }),
    );
  },

  async sendEmail(accessToken, { to, subject, body, cc }) {
    const headers = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
    ].filter(Boolean);
    const raw = Buffer.from(
      `${headers.join("\r\n")}\r\n\r\n${Buffer.from(body, "utf8").toString("base64")}`,
      "utf8",
    ).toString("base64url");

    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gmail send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { id?: string };
    return { id: json.id ?? "" };
  },
};
