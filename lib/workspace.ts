import "server-only";
import { db } from "./db";
import { env } from "./env";
import { seedDefaultWorkspaceKb } from "./default-kb";
import type { Workspace } from "./types";

/**
 * Finds or creates the `workspaces` row mirroring a Clerk org (or the single
 * self-hosted workspace). Creation uses safe defaults (SPEC §9: abandon-safe
 * wizard) and stamps the one-time platform credit + the 'calyflow' provider
 * row when the platform key is configured.
 */
export async function ensureWorkspace(
  clerkOrgId: string,
  /** Resolved only when a workspace is actually created — avoids an extra
   *  Clerk org lookup on every authenticated request. */
  name: string | (() => Promise<string>),
): Promise<Workspace> {
  const supabase = db();
  const { data: existing, error: selectError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing as Workspace;

  const resolvedName = typeof name === "function" ? await name() : name;
  const platformEnabled = env.platformProviderEnabled;
  const { data: created, error: insertError } = await supabase
    .from("workspaces")
    .insert({
      clerk_org_id: clerkOrgId,
      name: resolvedName,
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

  // Starter knowledge-base templates so new users see what the KB is for.
  await seedDefaultWorkspaceKb(created.id);

  return created as Workspace;
}

/**
 * Mirrors a name change made in Clerk (e.g. via the OrganizationSwitcher) back
 * onto the workspace row. Driven by the `organization.updated` webhook so the
 * Clerk → DB direction stays in sync (the DB → Clerk direction lives in
 * `syncClerkOrgName`). No-op when the org has no matching row or the name is
 * unchanged. Returns true when a row was updated.
 */
export async function syncWorkspaceNameFromClerk(
  clerkOrgId: string,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const { data, error } = await db()
    .from("workspaces")
    .update({ name: trimmed })
    .eq("clerk_org_id", clerkOrgId)
    .neq("name", trimmed)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
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
