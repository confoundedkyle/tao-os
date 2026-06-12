// Central place for env-driven configuration (self-hosting readiness, SPEC §13).

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appEncryptionKey() {
    return required("APP_ENCRYPTION_KEY");
  },

  /** Self-host mode: no Clerk orgs, every user lands in the single workspace. */
  get singleWorkspace() {
    return (
      process.env.SINGLE_WORKSPACE === "true" || !process.env.CLERK_SECRET_KEY
    );
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },

  /** When false, the "Calyflow default" provider row is never created. */
  get platformProviderEnabled() {
    return (
      process.env.PLATFORM_PROVIDER_ENABLED !== "false" &&
      !!process.env.CALYFLOW_PLATFORM_API_KEY
    );
  },
  get platformApiKey() {
    return process.env.CALYFLOW_PLATFORM_API_KEY ?? "";
  },
  /** Underlying provider the platform key/model belong to (anthropic, openai,
   *  google, …). Must match the key in CALYFLOW_PLATFORM_API_KEY. */
  get platformProvider() {
    return process.env.CALYFLOW_PLATFORM_PROVIDER ?? "anthropic";
  },
  get platformModel() {
    return process.env.CALYFLOW_PLATFORM_MODEL ?? "claude-sonnet-4-6";
  },
  get oneTimePlatformCreditDefaultUsd() {
    return Number(process.env.ONE_TIME_PLATFORM_CREDIT_DEFAULT_USD ?? "11.00");
  },

  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },

  /** Public base URL of this deployment, used to build OAuth redirect URIs
   *  (e.g. https://app.calyflow.com). No trailing slash. */
  get appBaseUrl() {
    return (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  },
  /** Airtable OAuth app credentials (the connector spike). */
  get airtableClientId() {
    return process.env.AIRTABLE_CLIENT_ID ?? "";
  },
  get airtableClientSecret() {
    return process.env.AIRTABLE_CLIENT_SECRET ?? "";
  },
  /** Google OAuth app credentials (Cloud console; the Sheets connector).
   *  The OAuth client must be a Web application with the
   *  /api/connectors/google-sheets/callback redirect URI registered. */
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  /** Zoho OAuth app credentials (API console; one client serves CRM + Recruit).
   *  Zoho is region-sharded — a deployment targets ONE data center, set via the
   *  base URLs below (defaults are the US DC; use .eu/.in/... for others). */
  get zohoClientId() {
    return process.env.ZOHO_CLIENT_ID ?? "";
  },
  get zohoClientSecret() {
    return process.env.ZOHO_CLIENT_SECRET ?? "";
  },
  get zohoAccountsBase() {
    return (process.env.ZOHO_ACCOUNTS_BASE ?? "https://accounts.zoho.com").replace(/\/$/, "");
  },
  get zohoApiBase() {
    return (process.env.ZOHO_API_BASE ?? "https://www.zohoapis.com").replace(/\/$/, "");
  },
  get zohoRecruitApiBase() {
    return (process.env.ZOHO_RECRUIT_API_BASE ?? "https://recruit.zoho.com").replace(/\/$/, "");
  },
  /** Svix signing secret for the Clerk webhook endpoint. */
  get clerkWebhookSigningSecret() {
    return process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? "";
  },
  /** Dev flag: stream a canned response instead of calling a provider. */
  get mockAi() {
    return process.env.MOCK_AI === "true";
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
