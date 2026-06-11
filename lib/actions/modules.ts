"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { MODULES, type ModuleKey } from "../types";

// Module activation is admin-only and only controls sidebar visibility — the
// underlying entity tables always exist and data is preserved across toggles
// (mirrors the workspace_connections model).

function isModuleKey(value: string): value is ModuleKey {
  return MODULES.some((m) => m.key === value);
}

export async function setModuleActiveAction(moduleKey: string, active: boolean) {
  const session = await requireAdmin();
  if (!isModuleKey(moduleKey)) throw new Error("Unknown module");

  const existing = await db()
    .from("workspace_modules")
    .select("id")
    .eq("workspace_id", session.workspaceId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  const row = {
    workspace_id: session.workspaceId,
    module_key: moduleKey,
    is_active: active,
    activated_at: active ? new Date().toISOString() : null,
    created_by: session.userId,
  };

  const { error } = existing.data
    ? await db()
        .from("workspace_modules")
        .update(row)
        .eq("id", existing.data.id)
    : await db().from("workspace_modules").insert(row);
  if (error) throw error;

  revalidatePath("/settings/modules");
  // "layout" so the sidebar nav (rendered in the app layout) refreshes.
  revalidatePath("/", "layout");
}
