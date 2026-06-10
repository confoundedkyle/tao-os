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
  get platformModel() {
    return process.env.CALYFLOW_PLATFORM_MODEL ?? "claude-sonnet-4-6";
  },
  get oneTimePlatformCreditDefaultUsd() {
    return Number(process.env.ONE_TIME_PLATFORM_CREDIT_DEFAULT_USD ?? "11.00");
  },

  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
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
