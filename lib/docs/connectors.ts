import {
  CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  CONNECTOR_DOMAINS,
  connectorFaviconUrl,
  type Connector,
  type ConnectorCategory,
} from "../connectors";
import { getSelfHostSetup, type SelfHostSetup } from "./self-hosting";

// Authored, non-technical docs content per connector. The catalog (lib/connectors.ts)
// is the source of truth for the name/category/auth/blurb/hints; here we only add
// the human prose. Un-authored connectors still render a useful page from the
// catalog hints (see getConnectorDoc fallback), so adding a connector to the
// catalog never leaves a blank docs page.

export interface ConnectorDocContent {
  /** Plain-language "what agents can do with it". */
  capabilities?: string[];
  /** What the user needs before connecting (account, admin rights, plan). */
  whatYouNeed?: string[];
  /** Numbered, non-technical "where to get your key / how to connect" steps. */
  steps?: string[];
  /** Helpful links (provider docs / settings pages). */
  links?: { label: string; url: string }[];
}

export const DOC_CONNECTORS: Record<string, ConnectorDocContent> = {
  // ── ATS ──────────────────────────────────────────────────────────────────
  ashby: {
    capabilities: [
      "List your open jobs and their pipelines",
      "List and search candidates to build shortlists",
    ],
    whatYouNeed: [
      "An Ashby account with admin access (to create an API key)",
    ],
    steps: [
      "In Ashby, open Admin → Integrations → API.",
      "Create a new API key and copy it.",
      "In Calyflow, go to Settings → Connectors → Ashby and paste the key.",
    ],
  },
  greenhouse: {
    capabilities: [
      "List jobs and the candidates attached to them",
      "Search candidates to assemble a shortlist for a role",
    ],
    whatYouNeed: ["A Greenhouse account with permission to create a Harvest API key"],
    steps: [
      "In Greenhouse, go to Configure (gear) → Dev Center → API Credential Management.",
      "Create a Harvest API key with read access to jobs and candidates, and copy it.",
      "In Calyflow, open Settings → Connectors → Greenhouse and paste the key.",
    ],
  },
  bullhorn: {
    capabilities: [
      "Sync jobs, candidates, and submissions from your Bullhorn",
      "Search candidates to shortlist for an open role",
    ],
    whatYouNeed: [
      "A Bullhorn account",
      "OAuth credentials issued by Bullhorn (your account manager / support enables API access)",
    ],
    steps: [
      "On the hosted version, open Settings → Connectors → Bullhorn and click Connect, then sign in to Bullhorn and approve access.",
      "If your account is on a regional cluster, Bullhorn support will tell you — self-hosters set the matching base URLs (see Self-hosting below).",
    ],
  },
  github: {
    capabilities: [
      "Search open-source repositories by topic and language",
      "Find a repo's contributors and the people who forked it",
      "Pull public commit-email contacts for outreach",
    ],
    whatYouNeed: [
      "A GitHub account (free is fine)",
    ],
    steps: [
      "Go to github.com → Settings → Developer settings → Personal access tokens.",
      "Create a token: a classic token with the public_repo scope, OR a fine-grained read-only token, is enough.",
      "Copy the token and paste it in Calyflow under Settings → Connectors → GitHub.",
    ],
    links: [
      { label: "GitHub: create a personal access token", url: "https://github.com/settings/tokens" },
    ],
  },
  vincere: {
    capabilities: [
      "Search candidates, contacts, and companies in your Vincere",
      "Search applications and list talent pools to source from",
    ],
    whatYouNeed: [
      "A Vincere account with access to API settings",
      "An OAuth app registered in your own Vincere instance (Vincere issues a Client ID per customer)",
    ],
    steps: [
      "In Vincere, go to Settings → API → API Authentication & Throttling.",
      "Register an app using the redirect URL Calyflow shows on the Connect screen.",
      "Copy the app's Client ID, paste it in Calyflow, then click Connect and approve. (Add a Client Secret only if Vincere issued your app a confidential one.)",
    ],
  },

  // ── CRM ──────────────────────────────────────────────────────────────────
  hubspot: {
    capabilities: [
      "Search client companies, contacts, and deals",
      "Pull BD pipeline context into research and outreach",
    ],
    whatYouNeed: ["A HubSpot account with permission to create a private app token"],
    steps: [
      "In HubSpot, go to Settings → Integrations → Private Apps.",
      "Create a private app with read scopes for contacts, companies, and deals, then copy its access token.",
      "Paste the token in Calyflow under Settings → Connectors → HubSpot.",
    ],
  },
  notion: {
    capabilities: [
      "Read the databases and pages your team runs recruiting on",
      "Pull candidate or client records into agent context",
    ],
    whatYouNeed: ["A Notion account and the ability to share pages with an integration"],
    steps: [
      "On the hosted version, open Settings → Connectors → Notion, click Connect, and choose which pages to share.",
    ],
  },

  // ── Data & spreadsheets ───────────────────────────────────────────────────
  "google-sheets": {
    capabilities: [
      "Read candidate and client trackers straight from your Sheets",
      "Feed a spreadsheet of candidates into outreach and sourcing agents",
    ],
    whatYouNeed: ["A Google account with access to the spreadsheets you want to use"],
    steps: [
      "Open Settings → Connectors → Google Sheets and click Connect.",
      "Sign in with Google and allow read access to your spreadsheets.",
    ],
  },
  gmail: {
    capabilities: ["Send candidate outreach from your own Gmail address"],
    whatYouNeed: ["A Gmail or Google Workspace account"],
    steps: [
      "Open Settings → Connectors → Gmail and click Connect.",
      "Sign in with Google and allow Calyflow to send mail on your behalf.",
    ],
  },
  "microsoft-outlook": {
    capabilities: ["Send candidate outreach from your Outlook / Microsoft 365 mailbox"],
    whatYouNeed: ["A Microsoft 365 / Outlook account"],
    steps: [
      "Open Settings → Connectors → Microsoft Outlook and click Connect.",
      "Sign in with Microsoft and approve sending mail on your behalf.",
    ],
  },

  // ── Comms ────────────────────────────────────────────────────────────────
  slack: {
    capabilities: [
      "Run any recruiting agent from a Slack channel with /calyflow or @Calyflow",
      "Receive automated daily or weekly project reports in the channel",
    ],
    whatYouNeed: ["A Slack workspace where you can install apps"],
    steps: [
      "Open Settings → Connectors → Slack and click Connect, then approve the Calyflow app in Slack.",
      "In a project's Settings → Slack, pick (or create) a channel for that project.",
      "In the channel, type /calyflow to see the available agents.",
    ],
  },

  // ── Sourcing & enrichment tools ───────────────────────────────────────────
  apollo: {
    capabilities: [
      "Search the 270M-profile B2B database for people and companies",
      "Enrich a person with verified contact details",
    ],
    whatYouNeed: ["An Apollo account with API access"],
    steps: [
      "In Apollo, go to Settings → Integrations → API and create an API key.",
      "Paste it in Calyflow under Settings → Connectors → Apollo.",
    ],
  },
  hunter: {
    capabilities: [
      "Find work email addresses for a company domain",
      "Verify whether an email address is deliverable",
    ],
    whatYouNeed: ["A Hunter.io account"],
    steps: [
      "In Hunter, open your account → API and copy your API key.",
      "Paste it in Calyflow under Settings → Connectors → Hunter.io.",
    ],
  },
  coresignal: {
    capabilities: [
      "Search employees by role, company, and location",
      "Enrich candidates with fresh public employment data",
    ],
    whatYouNeed: ["A Coresignal account with API access"],
    steps: [
      "In Coresignal, copy your API key from the dashboard.",
      "Paste it in Calyflow under Settings → Connectors → Coresignal.",
    ],
  },
};

export interface ConnectorDoc {
  connector: Connector;
  provider: string;
  category: ConnectorCategory;
  categoryLabel: string;
  faviconUrl?: string;
  authLabel: "One-click OAuth" | "Bring-your-own OAuth" | "API key";
  capabilities: string[];
  whatYouNeed: string[];
  /** Markdown/plain steps for connecting (authored, else from catalog hints). */
  steps: string[];
  apiKeyPlaceholder?: string;
  links: { label: string; url: string }[];
  selfHost: SelfHostSetup | null;
}

/** Live connectors that have a provider id (everything we can document + link). */
export function listLiveConnectors(): Connector[] {
  return CONNECTORS.filter((c) => c.live && c.provider);
}

/** Merge the catalog entry, authored content, and self-host setup for one
 *  connector. Returns null if the provider isn't a live connector. */
export function getConnectorDoc(provider: string): ConnectorDoc | null {
  const connector = CONNECTORS.find((c) => c.provider === provider && c.live);
  if (!connector) return null;
  const authored = DOC_CONNECTORS[provider] ?? {};

  const authLabel: ConnectorDoc["authLabel"] =
    connector.auth === "oauth"
      ? connector.byoOAuth
        ? "Bring-your-own OAuth"
        : "One-click OAuth"
      : "API key";

  // Steps fall back to the catalog's one-line hints so every page is useful.
  const steps =
    authored.steps ??
    (connector.auth === "apikey"
      ? [
          connector.apiKeyHint ??
            `Create an API key in your ${connector.name} account, then paste it in Calyflow under Settings → Connectors → ${connector.name}.`,
        ]
      : connector.byoOAuth
        ? [
            connector.oauthAppHint ??
              `Register an OAuth app in ${connector.name}, then connect from Settings → Connectors → ${connector.name}.`,
          ]
        : [
            `Open Settings → Connectors → ${connector.name} and click Connect, then sign in to ${connector.name} and approve access.`,
          ]);

  const domain = connector.provider
    ? CONNECTOR_DOMAINS[connector.provider]
    : undefined;

  return {
    connector,
    provider,
    category: connector.category,
    categoryLabel: CONNECTOR_CATEGORY_LABELS[connector.category],
    faviconUrl: connectorFaviconUrl(domain),
    authLabel,
    capabilities: authored.capabilities ?? [connector.blurb],
    whatYouNeed:
      authored.whatYouNeed ??
      [`A ${connector.name} account${connector.auth === "apikey" ? " with permission to create an API key" : ""}.`],
    steps,
    apiKeyPlaceholder: connector.apiKeyPlaceholder,
    links: authored.links ?? [],
    selfHost: getSelfHostSetup(provider, connector.auth),
  };
}
