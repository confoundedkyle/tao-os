import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service-role client, server-side only (SPEC §9: RLS pattern 2 — scoping is
// enforced in queries via workspace_id, never trusted from the client).
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
