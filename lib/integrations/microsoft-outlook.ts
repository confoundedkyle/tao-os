import "server-only";
import { env } from "../env";
import type { ConnectorAdapter, OAuthTokens } from "./types";

// Outlook exposes a send op beyond the shared auth interface; its tool
// imports this concrete type.
export interface MicrosoftOutlookAdapter extends ConnectorAdapter {
  sendEmail(
    accessToken: string,
    args: { to: string; subject: string; body: string; cc?: string },
  ): Promise<{ id: string }>;
}

// Microsoft identity platform OAuth2 (PKCE + client secret — same Entra app
// as the Excel connector, different scopes). Mail.Send is the
// least-privileged delegated scope for sending; it grants no mailbox read
// access. The `common` tenant accepts both work/school and personal accounts.
// Refresh tokens rotate (a new one arrives on every refresh), which
// getValidAccessToken in ./index.ts persists.
const OAUTH_AUTHORIZE =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const OAUTH_TOKEN =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

export const OUTLOOK_SCOPES = "offline_access Mail.Send User.Read";

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
    throw new Error(`Microsoft token exchange failed (${res.status}): ${detail}`);
  }
  return tokensFromResponse(await res.json());
}

export const microsoftOutlookAdapter: MicrosoftOutlookAdapter = {
  provider: "microsoft-outlook",
  authType: "oauth",

  getAuthorizeUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env.microsoftClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OUTLOOK_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const tokens = await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.microsoftClientId,
        client_secret: env.microsoftClientSecret,
        code_verifier: codeVerifier,
        scope: OUTLOOK_SCOPES,
      }),
    );
    // Best-effort account label from the Graph profile.
    try {
      const res = await fetch(`${GRAPH_API}/me`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (res.ok) {
        const who = (await res.json()) as {
          mail?: string;
          userPrincipalName?: string;
        };
        tokens.accountLabel = who.mail ?? who.userPrincipalName;
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
        client_id: env.microsoftClientId,
        client_secret: env.microsoftClientSecret,
        scope: OUTLOOK_SCOPES,
      }),
    );
  },

  async sendEmail(accessToken, { to, subject, body, cc }) {
    const res = await fetch(`${GRAPH_API}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(cc
            ? { ccRecipients: [{ emailAddress: { address: cc } }] }
            : {}),
        },
        saveToSentItems: true,
      }),
    });
    // Graph returns 202 with an empty body on success.
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const detail = json?.error?.message ?? res.statusText;
      throw new Error(`Outlook send failed (${res.status}): ${detail}`);
    }
    return { id: "sent" };
  },
};
