// Call-time env for modules under test. lib/env.ts getters are lazy, so
// setting these before tests run is sufficient; nothing throws at import.
process.env.APP_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.AIRTABLE_CLIENT_ID ??= "test-airtable-client-id";
process.env.AIRTABLE_CLIENT_SECRET ??= "test-airtable-client-secret";
// Deliberately NOT set: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — lib/db.ts is
// lazy and mocked where needed; an accidental real-db path should fail loudly.
