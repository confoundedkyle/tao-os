import "server-only";
import { db } from "./db";
import { env } from "./env";
import type { Workspace } from "./types";

/**
 * Finds or creates the `workspaces` row mirroring a Clerk org (or the single
 * self-hosted workspace). Creation uses safe defaults (SPEC §9: abandon-safe
 * wizard) and stamps the one-time platform credit + the 'calyflow' provider
 * row when the platform key is configured.
 */
export async function ensureWorkspace(
  clerkOrgId: string,
  name: string,
): Promise<Workspace> {
  const supabase = db();
  const { data: existing, error: selectError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing as Workspace;

  const platformEnabled = env.platformProviderEnabled;
  const { data: created, error: insertError } = await supabase
    .from("workspaces")
    .insert({
      clerk_org_id: clerkOrgId,
      name,
      one_time_platform_credit_usd: platformEnabled
        ? env.oneTimePlatformCreditDefaultUsd
        : 0,
    })
    .select("*")
    .single();
  if (insertError) {
    // Concurrent first requests can race on the unique clerk_org_id.
    const { data: raced } = await supabase
      .from("workspaces")
      .select("*")
      .eq("clerk_org_id", clerkOrgId)
      .single();
    if (raced) return raced as Workspace;
    throw insertError;
  }

  if (platformEnabled) {
    await supabase.from("workspace_ai_providers").insert({
      workspace_id: created.id,
      provider: "calyflow",
      default_model: env.platformModel,
      priority: 1,
      status: "valid",
    });
  }
  return created as Workspace;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const { data, error } = await db()
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error) throw error;
  return data as Workspace;
}
