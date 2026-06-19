// Self-hosting setup facts for connectors, surfaced in the public docs. Hosted
// users never touch any of this — OAuth connectors are one click and API-key
// connectors just need a key. Self-hosters running their own Calyflow instance
// must register their own OAuth app per OAuth provider and set env vars.
//
// Source of truth: .github/workflows/deploy.yml + lib/env.ts. Keep in sync.

export interface SelfHostSetup {
  /** Env vars the self-hoster sets (client id/secret + any regional bases). */
  envVars: string[];
  /** OAuth redirect/callback path appended to APP_BASE_URL. */
  redirectPath: string;
  /** Where to register the OAuth app (provider-side). */
  registerAt?: string;
  /** Extra notes (regional bases, shared apps, signing secret, BYO). */
  notes?: string[];
}

const UPPER = (provider: string) => provider.replace(/-/g, "_").toUpperCase();

// Providers whose OAuth app/env differ from the default `${PROVIDER}_CLIENT_*`.
const OVERRIDES: Record<string, SelfHostSetup> = {
  "google-sheets": {
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    redirectPath: "/api/connectors/google-sheets/callback",
    registerAt: "Google Cloud Console → APIs & Services → Credentials (OAuth client, type Web application)",
    notes: [
      "One Google OAuth app powers both Google Sheets and Gmail — add both redirect URIs to the same client.",
    ],
  },
  gmail: {
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    redirectPath: "/api/connectors/gmail/callback",
    registerAt: "Google Cloud Console → APIs & Services → Credentials (OAuth client, type Web application)",
    notes: [
      "Shares the GOOGLE_* app with Google Sheets — register both redirect URIs on the one client.",
    ],
  },
  "microsoft-excel": {
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    redirectPath: "/api/connectors/microsoft-excel/callback",
    registerAt: "Microsoft Entra ID → App registrations",
    notes: [
      "One Microsoft app registration powers both Excel and Outlook — add both redirect URIs.",
    ],
  },
  "microsoft-outlook": {
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    redirectPath: "/api/connectors/microsoft-outlook/callback",
    registerAt: "Microsoft Entra ID → App registrations",
    notes: [
      "Shares the MICROSOFT_* app with Excel — register both redirect URIs on the one app.",
    ],
  },
  "zoho-crm": {
    envVars: [
      "ZOHO_CLIENT_ID",
      "ZOHO_CLIENT_SECRET",
      "ZOHO_ACCOUNTS_BASE",
      "ZOHO_API_BASE",
      "ZOHO_RECRUIT_API_BASE",
    ],
    redirectPath: "/api/connectors/zoho-crm/callback",
    registerAt: "Zoho API Console (api-console.zoho.com), Server-based Application",
    notes: [
      "One Zoho OAuth app serves both Zoho CRM and Zoho Recruit.",
      "Zoho is region-sharded: set the *_BASE vars to your data center (e.g. .eu, .in) — defaults target the US (.com).",
    ],
  },
  "zoho-recruit": {
    envVars: [
      "ZOHO_CLIENT_ID",
      "ZOHO_CLIENT_SECRET",
      "ZOHO_ACCOUNTS_BASE",
      "ZOHO_API_BASE",
      "ZOHO_RECRUIT_API_BASE",
    ],
    redirectPath: "/api/connectors/zoho-recruit/callback",
    registerAt: "Zoho API Console (api-console.zoho.com), Server-based Application",
    notes: [
      "Shares the ZOHO_* app with Zoho CRM.",
      "Region-sharded: point the *_BASE vars at your data center; defaults are US (.com).",
    ],
  },
  bullhorn: {
    envVars: [
      "BULLHORN_CLIENT_ID",
      "BULLHORN_CLIENT_SECRET",
      "BULLHORN_AUTH_BASE",
      "BULLHORN_REST_LOGIN_BASE",
    ],
    redirectPath: "/api/connectors/bullhorn/callback",
    registerAt: "Bullhorn support / your Bullhorn account manager (they issue OAuth credentials)",
    notes: [
      "Bullhorn is multi-cluster: if your account is on a regional swimlane, set BULLHORN_AUTH_BASE and BULLHORN_REST_LOGIN_BASE accordingly (defaults target the main US cluster).",
    ],
  },
  vincere: {
    envVars: ["VINCERE_CLIENT_ID", "VINCERE_CLIENT_SECRET", "VINCERE_ID_BASE"],
    redirectPath: "/api/connectors/vincere/callback",
    registerAt: "Your Vincere instance → Settings → API → API Authentication & Throttling",
    notes: [
      "Vincere issues a Client ID per customer instance, so each workspace registers its OWN app and pastes the Client ID in Calyflow (bring-your-own-OAuth) — even on the hosted version. A Client Secret is only needed if Vincere issued your app a confidential one.",
      "Use VINCERE_ID_BASE = https://id.vinceredev.com for the Vincere test environment.",
    ],
  },
  slack: {
    envVars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET"],
    redirectPath: "/api/connectors/slack/callback",
    registerAt: "api.slack.com/apps (create an app, ideally from a manifest)",
    notes: [
      "SLACK_SIGNING_SECRET verifies inbound slash-command and event requests — set it alongside the client id/secret.",
      "Also register the slash-command URL /api/slack/commands and the Events Request URL /api/slack/events.",
    ],
  },
};

/**
 * Self-hosting OAuth setup for a connector, or null for API-key connectors
 * (which need no OAuth app — the user just pastes a key, same as hosted).
 */
export function getSelfHostSetup(
  provider: string,
  auth: "oauth" | "apikey" | undefined,
): SelfHostSetup | null {
  if (auth !== "oauth") return null;
  if (OVERRIDES[provider]) return OVERRIDES[provider];
  return {
    envVars: [`${UPPER(provider)}_CLIENT_ID`, `${UPPER(provider)}_CLIENT_SECRET`],
    redirectPath: `/api/connectors/${provider}/callback`,
  };
}
